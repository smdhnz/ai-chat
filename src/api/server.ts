import { basename, extname, join } from "node:path";
import { and, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import {
  classifyThinking,
  generateImage,
  getChatModel,
  resolveAiSettings,
  resolveRunThinking,
  streamChat,
  summarizeConversation,
  supportedThinkingLevels,
  type ThinkingLevel,
} from "./ai";
import { ConversationRunner, type ChatEventEnvelope } from "./agent";
import { createAgentTools } from "./agent-tools";
import {
  allConversationFileIds,
  appendLegacyMessage,
  listLegacyMessages,
  pagePublicMessages,
  rewindConversation,
} from "./agent-messages";
import { config, storedFilePath } from "./config";
import { attachmentText } from "./attachments";
import { cleanupExpired, db, id, now } from "./db";
import { MESSAGE_PAGE_SIZE, regenerationIndex } from "./messages";
import { buildSystemPrompt } from "./prompt";
import { webSearch } from "./web-search";
import {
  conversations as conversationsTable,
  files as filesTable,
  oauthStates,
  projects as projectsTable,
  runs as runsTable,
  sessions,
  skills as skillsTable,
  users,
} from "./schema";

type SocketData = { userId: string };
const chatModel = getChatModel(config.codexModel);
const conversationRunner = new ConversationRunner({
  database: db,
  model: chatModel,
  streamFn: streamChat,
  timeoutMs: config.aiTimeoutMs,
  summarize: summarizeConversation,
  tools: (context) =>
    createAgentTools(context, {
      database: db,
      dataDir: config.dataDir,
      imageTimeoutMs: config.aiTimeoutMs,
      maxImageBytes: config.maxUploadBytes,
      webSearch,
      generateImage,
    }),
  publish: (userId, envelope) => publishAgentEvent(userId, envelope),
});

cleanupExpired();
await cleanupTemporaryConversations();
setInterval(() => {
  cleanupExpired();
  void cleanupTemporaryConversations();
}, 60 * 60_000).unref();

const server = Bun.serve<SocketData>({
  port: config.port,
  async fetch(request, server) {
    try {
      const url = new URL(request.url);
      const user = sessionUser(request);

      if (
        url.pathname.startsWith("/_next/") ||
        /^\/(?:favicon\.svg|apple-touch-icon\.png|icon-(?:192|512)\.png|site\.webmanifest)$/.test(
          url.pathname,
        )
      )
        return webApp(request);
      if (url.pathname === "/login") return user ? redirect("/") : webApp(request);
      if (url.pathname === "/api/auth/discord") return startDiscordLogin();
      if (url.pathname === "/api/auth/callback/discord") return finishDiscordLogin(request, url);
      if (url.pathname === "/logout" && request.method === "POST") {
        verifyOrigin(request);
        const token = cookie(request, "session");
        if (token)
          db.delete(sessions)
            .where(eq(sessions.token_hash, hash(token)))
            .run();
        return new Response(null, {
          status: 303,
          headers: { Location: "/login", "Set-Cookie": sessionCookie("", 0) },
        });
      }
      if (!user)
        return url.pathname.startsWith("/api/")
          ? json({ error: "unauthorized" }, 401)
          : redirect("/login");
      if (url.pathname === "/api/socket") {
        if (request.headers.get("origin") !== config.origin)
          return json({ error: "invalid origin" }, 403);
        if (server.upgrade(request, { data: { userId: user.id } })) return;
        return json({ error: "websocket upgrade required" }, 426);
      }
      if (url.pathname === "/settings" || url.pathname.startsWith("/settings/"))
        return redirect("/");
      if (/^\/chat\/[\w-]+$/.test(url.pathname))
        return ownedConversation(url.pathname.slice(6), user.id) ? webApp(request) : redirect("/");

      if (url.pathname === "/api/bootstrap" && request.method === "GET") return bootstrap(user);
      if (url.pathname === "/api/conversations" && request.method === "POST")
        return createConversation(request, user);
      const conversationMatch = url.pathname.match(/^\/api\/conversations\/([\w-]+)$/);
      if (conversationMatch && request.method === "GET")
        return conversationMessages(conversationMatch[1], user.id, url.searchParams.get("before"));
      if (conversationMatch && request.method === "DELETE")
        return deleteConversation(request, conversationMatch[1], user.id);
      const generationMatch = url.pathname.match(
        /^\/api\/conversations\/([\w-]+)\/(stop|regenerate)$/,
      );
      if (generationMatch && request.method === "POST")
        return generationMatch[2] === "stop"
          ? stopGeneration(request, generationMatch[1], user.id)
          : regenerate(request, generationMatch[1], user);
      if (url.pathname === "/api/chat" && request.method === "POST")
        return sendMessage(request, user);
      if (url.pathname === "/api/settings" && request.method === "PUT")
        return saveSettings(request, user.id);
      if (url.pathname === "/api/data" && request.method === "DELETE")
        return deleteAllData(request, user.id);
      if (url.pathname === "/api/projects" && request.method === "POST")
        return saveProject(request, user.id);
      const projectMatch = url.pathname.match(/^\/api\/projects\/([\w-]+)$/);
      if (projectMatch && request.method === "PUT")
        return saveProject(request, user.id, projectMatch[1]);
      if (projectMatch && request.method === "DELETE")
        return removeOwned(request, "projects", projectMatch[1], user.id);
      if (url.pathname === "/api/skills" && request.method === "POST")
        return saveSkill(request, user.id);
      const skillMatch = url.pathname.match(/^\/api\/skills\/([\w-]+)$/);
      if (skillMatch && request.method === "PUT") return saveSkill(request, user.id, skillMatch[1]);
      if (skillMatch && request.method === "DELETE")
        return removeOwned(request, "skills", skillMatch[1], user.id);
      const fileMatch = url.pathname.match(/^\/files\/([\w-]+)$/);
      if (fileMatch && request.method === "GET")
        return serveUserFile(fileMatch[1], user.id, url.searchParams.has("download"));
      if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/files/"))
        return json({ error: "not found" }, 404);
      return webApp(request);
    } catch (error) {
      console.error("request failed", error instanceof Error ? error.name : "UnknownError");
      return json({ error: "request failed" }, 500);
    }
  },
  websocket: {
    open(socket) {
      socket.subscribe(userTopic(socket.data.userId));
    },
    message(socket) {
      socket.close(1003, "server events only");
    },
  },
});
console.log(`ai-chat listening on ${config.origin}`);

type User = {
  id: string;
  username: string;
  display_name: string;
  avatar: string | null;
  language: string;
  ctrl_enter_send: number;
  thinking_level: ThinkingLevel;
};
type ProjectRow = {
  id: string;
  name: string;
  system_prompt: string;
  created_at: string;
  updated_at: string;
};
type HistoryRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  file_ids: string;
  attachment_context: string;
  created_at: string;
};
function bootstrap(user: User): Response {
  const projects = db
    .select({
      id: projectsTable.id,
      name: projectsTable.name,
      system_prompt: projectsTable.system_prompt,
      created_at: projectsTable.created_at,
      updated_at: projectsTable.updated_at,
    })
    .from(projectsTable)
    .where(eq(projectsTable.user_id, user.id))
    .orderBy(desc(projectsTable.updated_at))
    .all() satisfies ProjectRow[];
  const activeRuns = new Map(
    db
      .select({ id: runsTable.id, conversation_id: runsTable.conversation_id })
      .from(runsTable)
      .innerJoin(conversationsTable, eq(conversationsTable.id, runsTable.conversation_id))
      .where(
        and(
          eq(conversationsTable.user_id, user.id),
          inArray(runsTable.status, ["queued", "running"]),
        ),
      )
      .orderBy(desc(runsTable.created_at))
      .all()
      .reverse()
      .map((run) => [run.conversation_id, run.id]),
  );
  const conversations = db
    .select({
      id: conversationsTable.id,
      project_id: conversationsTable.project_id,
      title: conversationsTable.title,
      temporary: conversationsTable.temporary,
      generation_status: conversationsTable.generation_status,
      unread: conversationsTable.unread,
      created_at: conversationsTable.created_at,
      updated_at: conversationsTable.updated_at,
    })
    .from(conversationsTable)
    .where(eq(conversationsTable.user_id, user.id))
    .orderBy(desc(conversationsTable.updated_at))
    .all()
    .map((conversation) => ({
      ...conversation,
      activeRunId: activeRuns.get(conversation.id) ?? null,
    }));
  const settings = resolveAiSettings(user.thinking_level);
  return json({
    user: { ...user, thinking_level: settings.thinking },
    supported_thinking_levels: supportedThinkingLevels(chatModel),
    model: { id: chatModel.id, supportedThinkingLevels: supportedThinkingLevels(chatModel) },
    projects,
    conversations,
    files: db
      .select({
        id: filesTable.id,
        name: filesTable.name,
        mime: filesTable.mime,
        size: filesTable.size,
        source: filesTable.source,
        created_at: filesTable.created_at,
      })
      .from(filesTable)
      .where(eq(filesTable.user_id, user.id))
      .orderBy(desc(filesTable.created_at))
      .limit(200)
      .all(),
    skills: db
      .select({
        id: skillsTable.id,
        name: skillsTable.name,
        description: skillsTable.description,
        instructions: skillsTable.instructions,
        enabled: skillsTable.enabled,
        created_at: skillsTable.created_at,
        updated_at: skillsTable.updated_at,
      })
      .from(skillsTable)
      .where(eq(skillsTable.user_id, user.id))
      .orderBy(desc(skillsTable.updated_at))
      .all(),
  });
}

async function createConversation(request: Request, user: User): Promise<Response> {
  verifyOrigin(request);
  const body = (await request.json()) as {
    projectId?: string;
    title?: string;
    temporary?: boolean;
  };
  const project =
    body.projectId &&
    db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(and(eq(projectsTable.id, body.projectId), eq(projectsTable.user_id, user.id)))
      .get();
  const conversation = {
    id: id(),
    project_id: project ? (body.projectId ?? null) : null,
    title: clean(body.title, 100) || "新しいチャット",
    temporary: body.temporary === true ? 1 : 0,
    generation_status: "idle" as const,
    unread: 0,
    created_at: now(),
    updated_at: now(),
  };
  db.insert(conversationsTable)
    .values({ ...conversation, user_id: user.id })
    .run();
  return json(conversation, 201);
}

function userTopic(userId: string): string {
  return `user:${userId}`;
}

function publishAgentEvent(userId: string, envelope: ChatEventEnvelope): void {
  server.publish(userTopic(userId), JSON.stringify(envelope));
}

function conversationMessages(
  conversationId: string,
  userId: string,
  before: string | null,
): Response {
  if (!ownedConversation(conversationId, userId)) return json({ error: "not found" }, 404);
  db.update(conversationsTable)
    .set({ unread: 0 })
    .where(and(eq(conversationsTable.id, conversationId), eq(conversationsTable.user_id, userId)))
    .run();
  let page;
  try {
    page = pagePublicMessages(db, conversationId, before, MESSAGE_PAGE_SIZE);
  } catch (error) {
    if (error instanceof Error && error.message === "invalid cursor")
      return json({ error: "invalid cursor" }, 400);
    throw error;
  }
  return json({
    messages: page.messages.map(({ fileIds, ...message }) => ({
      ...message,
      files: filesByIds(fileIds, userId),
    })),
    hasMore: page.hasMore,
  });
}

async function deleteConversation(
  request: Request,
  conversationId: string,
  userId: string,
): Promise<Response> {
  verifyOrigin(request);
  await conversationRunner.stop(conversationId, userId);
  await removeConversationData(conversationId, userId);
  return new Response(null, { status: 204 });
}

async function sendMessage(request: Request, user: User): Promise<Response> {
  verifyOrigin(request);
  const form = await request.formData();
  const conversationId = String(form.get("conversationId") || "");
  const content = clean(String(form.get("content") || ""), 20_000);
  const uploadEntries = form.getAll("files");
  const uploads = uploadEntries.filter(
    (entry): entry is File => entry instanceof File && entry.size > 0,
  );
  if (!content && !uploads.length) return json({ error: "message is empty" }, 400);
  if (uploads.some((file) => !/^image\/(png|jpeg|webp|gif)$/i.test(file.type)))
    return json({ error: "添付できるのは画像のみです" }, 400);
  const conversation = ownedConversation(conversationId, user.id);
  if (!conversation) return json({ error: "conversation not found" }, 404);
  if (
    db
      .select({ id: runsTable.id })
      .from(runsTable)
      .where(
        and(
          eq(runsTable.conversation_id, conversationId),
          inArray(runsTable.status, ["queued", "running"]),
        ),
      )
      .get()
  )
    return json({ error: "すでに生成中です" }, 409);

  const savedUploads = await saveUploads(uploads, user.id);
  const timestamp = now();
  const message = {
    id: id(),
    role: "user" as const,
    content,
    files: publicFiles(savedUploads),
    created_at: timestamp,
  };
  appendLegacyMessage(db, {
    id: message.id,
    conversationId,
    role: message.role,
    content,
    fileIds: savedUploads.map((file) => file.id),
    attachmentContext: await attachmentText(savedUploads),
    createdAt: timestamp,
  });
  await startGeneration(conversationId, user, message.id);
  return json({ message, status: "running" }, 202);
}

async function startGeneration(
  conversationId: string,
  user: User,
  userEntryId: string,
): Promise<void> {
  const settings = resolveAiSettings(user.thinking_level);
  const messages = listLegacyMessages(db, conversationId) as HistoryRow[];
  const latest = messages.at(-1);
  if (!latest || latest.id !== userEntryId || latest.role !== "user")
    throw new Error("latest user message not found");
  const needsTitle = messages.filter((message) => message.role === "user").length === 1;
  const thinking = await resolveRunThinking(
    settings.thinking,
    chatModel,
    () =>
      classifyThinking({
        latestUserText: latest.content.slice(0, 4_000),
        recentText: messages.slice(-3, -1).map((message) => ({
          role: message.role,
          text: message.content.slice(0, 2_000),
        })),
        imageCount: (JSON.parse(latest.file_ids) as string[]).length,
        needsTitle,
      }),
    needsTitle,
  );
  if (needsTitle && thinking.title)
    db.update(conversationsTable)
      .set({ title: clean(thinking.title, 100) })
      .where(
        and(eq(conversationsTable.id, conversationId), eq(conversationsTable.user_id, user.id)),
      )
      .run();
  await conversationRunner.start({
    conversationId,
    userId: user.id,
    userEntryId,
    systemPrompt: buildSystemPrompt(db, conversationId, user.id, user.language),
    requestedThinking: settings.thinking,
    resolvedThinking: thinking.resolved,
  });
}

async function stopGeneration(
  request: Request,
  conversationId: string,
  userId: string,
): Promise<Response> {
  verifyOrigin(request);
  if (!ownedConversation(conversationId, userId)) return json({ error: "not found" }, 404);
  await conversationRunner.stop(conversationId, userId);
  return new Response(null, { status: 204 });
}

async function regenerate(request: Request, conversationId: string, user: User): Promise<Response> {
  verifyOrigin(request);
  const conversation = ownedConversation(conversationId, user.id) as {
    generation_status: string;
  } | null;
  if (!conversation) return json({ error: "not found" }, 404);
  if (conversation.generation_status === "running")
    return json({ error: "生成を停止してから再実行してください" }, 409);
  const body = (await request.json().catch(() => ({}))) as {
    messageId?: string;
    content?: string;
  };
  const messages = listLegacyMessages(db, conversationId) as HistoryRow[];
  const userIndex = regenerationIndex(messages, body.messageId);
  if (userIndex < 0) return json({ error: "再生成できるメッセージがありません" }, 400);
  const userMessage = messages[userIndex];
  const content = Object.hasOwn(body, "content")
    ? clean(body.content, 20_000)
    : userMessage.content;
  if (!content && JSON.parse(userMessage.file_ids).length === 0)
    return json({ error: "message is empty" }, 400);
  const fileIdsBefore = allConversationFileIds(db, conversationId);
  let removedFiles: { id: string; path: string; source: string }[] = [];
  db.transaction(() => {
    rewindConversation(db, conversationId, user.id, userMessage.id, content);
    const retained = new Set(allConversationFileIds(db, conversationId));
    removedFiles = fileRecords(
      fileIdsBefore.filter((fileId) => !retained.has(fileId)),
      user.id,
    ).filter((file) => file.source === "generated");
    deleteFileRecords(removedFiles, user.id);
  });
  await removeFiles(removedFiles);
  await startGeneration(conversationId, user, userMessage.id);
  return json({ status: "running" }, 202);
}

async function saveSettings(request: Request, userId: string): Promise<Response> {
  verifyOrigin(request);
  const body = (await request.json()) as {
    language?: string;
    ctrlEnterSend?: boolean;
    thinking?: string;
  };
  const language = clean(body.language, 80) || "Japanese";
  const ctrlEnterSend = body.ctrlEnterSend === true ? 1 : 0;
  const thinking = clean(body.thinking, 20);
  if (!["auto", "minimal", "low", "medium", "high", "xhigh", "max"].includes(thinking))
    return json({ error: "invalid thinking level" }, 400);
  db.update(users)
    .set({
      language,
      ctrl_enter_send: ctrlEnterSend,
      thinking_level: thinking,
      updated_at: now(),
    })
    .where(eq(users.id, userId))
    .run();
  return json({
    language,
    ctrl_enter_send: ctrlEnterSend,
    thinking_level: thinking,
  });
}

async function saveProject(
  request: Request,
  userId: string,
  projectId: string = id(),
): Promise<Response> {
  verifyOrigin(request);
  const body = (await request.json()) as { name?: string; systemPrompt?: string };
  const name = clean(body.name, 80);
  const prompt = clean(body.systemPrompt, 30_000);
  if (!name) return json({ error: "name is required" }, 400);
  const existing = db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.user_id, userId)))
    .get();
  if (existing)
    db.update(projectsTable)
      .set({ name, system_prompt: prompt, updated_at: now() })
      .where(and(eq(projectsTable.id, projectId), eq(projectsTable.user_id, userId)))
      .run();
  else {
    const timestamp = now();
    db.insert(projectsTable)
      .values({
        id: projectId,
        user_id: userId,
        name,
        system_prompt: prompt,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .run();
  }
  return json(
    db
      .select({
        id: projectsTable.id,
        name: projectsTable.name,
        system_prompt: projectsTable.system_prompt,
        created_at: projectsTable.created_at,
        updated_at: projectsTable.updated_at,
      })
      .from(projectsTable)
      .where(and(eq(projectsTable.id, projectId), eq(projectsTable.user_id, userId)))
      .get(),
    existing ? 200 : 201,
  );
}

async function saveSkill(
  request: Request,
  userId: string,
  skillId: string = id(),
): Promise<Response> {
  verifyOrigin(request);
  const body = (await request.json()) as {
    name?: string;
    description?: string;
    instructions?: string;
    enabled?: boolean;
  };
  const name = clean(body.name, 80),
    description = clean(body.description, 500),
    instructions = clean(body.instructions, 30_000);
  if (!name || !instructions) return json({ error: "name and instructions are required" }, 400);
  const enabled = body.enabled === false ? 0 : 1;
  const existing = db
    .select({ id: skillsTable.id })
    .from(skillsTable)
    .where(and(eq(skillsTable.id, skillId), eq(skillsTable.user_id, userId)))
    .get();
  if (existing)
    db.update(skillsTable)
      .set({ name, description, instructions, enabled, updated_at: now() })
      .where(and(eq(skillsTable.id, skillId), eq(skillsTable.user_id, userId)))
      .run();
  else {
    const timestamp = now();
    db.insert(skillsTable)
      .values({
        id: skillId,
        user_id: userId,
        name,
        description,
        instructions,
        enabled,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .run();
  }
  return json(
    db
      .select({
        id: skillsTable.id,
        name: skillsTable.name,
        description: skillsTable.description,
        instructions: skillsTable.instructions,
        enabled: skillsTable.enabled,
        created_at: skillsTable.created_at,
        updated_at: skillsTable.updated_at,
      })
      .from(skillsTable)
      .where(and(eq(skillsTable.id, skillId), eq(skillsTable.user_id, userId)))
      .get(),
    existing ? 200 : 201,
  );
}

async function cleanupTemporaryConversations(): Promise<void> {
  const expired = db
    .select({ id: conversationsTable.id, user_id: conversationsTable.user_id })
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.temporary, 1),
        lt(conversationsTable.updated_at, new Date(Date.now() - 24 * 60 * 60_000).toISOString()),
      ),
    )
    .all();
  for (const conversation of expired)
    await removeConversationData(conversation.id, conversation.user_id);
}

async function removeConversationData(conversationId: string, userId: string): Promise<void> {
  const files = fileRecords(allConversationFileIds(db, conversationId), userId);
  db.transaction((tx) => {
    tx.delete(conversationsTable)
      .where(and(eq(conversationsTable.id, conversationId), eq(conversationsTable.user_id, userId)))
      .run();
    deleteFileRecords(files, userId);
  });
  await removeFiles(files);
}

async function deleteAllData(request: Request, userId: string): Promise<Response> {
  verifyOrigin(request);
  const files = db
    .select({ id: filesTable.id, path: filesTable.path })
    .from(filesTable)
    .where(eq(filesTable.user_id, userId))
    .all();
  db.transaction((tx) => {
    tx.delete(conversationsTable).where(eq(conversationsTable.user_id, userId)).run();
    tx.delete(projectsTable).where(eq(projectsTable.user_id, userId)).run();
    deleteFileRecords(files, userId);
  });
  await removeFiles(files);
  return new Response(null, { status: 204 });
}

async function removeOwned(
  request: Request,
  table: "projects" | "skills",
  objectId: string,
  userId: string,
): Promise<Response> {
  verifyOrigin(request);
  const files =
    table === "projects"
      ? fileRecords(
          db
            .select({ id: conversationsTable.id })
            .from(conversationsTable)
            .where(
              and(
                eq(conversationsTable.project_id, objectId),
                eq(conversationsTable.user_id, userId),
              ),
            )
            .all()
            .flatMap((conversation) => allConversationFileIds(db, conversation.id)),
          userId,
        )
      : [];
  db.transaction((tx) => {
    if (table === "projects")
      tx.delete(projectsTable)
        .where(and(eq(projectsTable.id, objectId), eq(projectsTable.user_id, userId)))
        .run();
    else
      tx.delete(skillsTable)
        .where(and(eq(skillsTable.id, objectId), eq(skillsTable.user_id, userId)))
        .run();
    deleteFileRecords(files, userId);
  });
  await removeFiles(files);
  return new Response(null, { status: 204 });
}

function fileRecords(
  ids: string[],
  userId: string,
): { id: string; path: string; source: string }[] {
  const unique = [...new Set(ids)];
  return unique.length
    ? db
        .select({ id: filesTable.id, path: filesTable.path, source: filesTable.source })
        .from(filesTable)
        .where(and(eq(filesTable.user_id, userId), inArray(filesTable.id, unique)))
        .all()
    : [];
}

function deleteFileRecords(files: { id: string }[], userId: string): void {
  if (files.length)
    db.delete(filesTable)
      .where(
        and(
          eq(filesTable.user_id, userId),
          inArray(
            filesTable.id,
            files.map((file) => file.id),
          ),
        ),
      )
      .run();
}

async function removeFiles(files: { path: string }[]): Promise<void> {
  await Promise.all(files.map((file) => unlink(storedFilePath(file.path)).catch(() => undefined)));
}

async function serveUserFile(fileId: string, userId: string, download: boolean): Promise<Response> {
  const file = db
    .select({ name: filesTable.name, path: filesTable.path, mime: filesTable.mime })
    .from(filesTable)
    .where(and(eq(filesTable.id, fileId), eq(filesTable.user_id, userId)))
    .get();
  if (!file) return json({ error: "not found" }, 404);
  const path = storedFilePath(file.path);
  if (!(await Bun.file(path).exists())) return json({ error: "not found" }, 404);
  return new Response(Bun.file(path), {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function saveUploads(entries: FormDataEntryValue[], userId: string): Promise<StoredFile[]> {
  const result: StoredFile[] = [];
  let total = 0;
  for (const entry of entries) {
    if (!(entry instanceof File) || !entry.size) continue;
    total += entry.size;
    if (entry.size > config.maxUploadBytes || total > config.maxUploadBytes)
      throw new Error(`ファイルは合計${Math.floor(config.maxUploadBytes / 1024 / 1024)}MBまでです`);
    const fileId = id(),
      name = clean(basename(entry.name), 255) || "file";
    const directory = join(
      config.dataDir,
      "users",
      userId,
      "files",
      new Date().toISOString().slice(0, 10),
    );
    await mkdir(directory, { recursive: true });
    const path = join(directory, `${fileId}${extname(name).slice(0, 12)}`);
    await writeFile(path, Buffer.from(await entry.arrayBuffer()));
    const file = {
      id: fileId,
      name,
      path,
      mime: entry.type || "application/octet-stream",
      size: entry.size,
      source: "upload",
      created_at: now(),
    };
    insertFile(file, userId);
    result.push(file);
  }
  return result;
}

type StoredFile = {
  id: string;
  name: string;
  path: string;
  mime: string;
  size: number;
  source: string;
  created_at: string;
};
function insertFile(file: StoredFile, userId: string): void {
  db.insert(filesTable)
    .values({ ...file, user_id: userId })
    .run();
}
function publicFiles(files: StoredFile[]) {
  return files.map(({ id, name, mime, size, source, created_at }) => ({
    id,
    name,
    mime,
    size,
    source,
    created_at,
  }));
}
function filesByIds(ids: string[], userId: string) {
  return ids.length
    ? db
        .select({
          id: filesTable.id,
          name: filesTable.name,
          mime: filesTable.mime,
          size: filesTable.size,
          source: filesTable.source,
          created_at: filesTable.created_at,
        })
        .from(filesTable)
        .where(and(eq(filesTable.user_id, userId), inArray(filesTable.id, ids)))
        .all()
    : [];
}

function startDiscordLogin(): Response {
  const state = crypto.randomUUID();
  db.insert(oauthStates)
    .values({ state, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() })
    .run();
  const target = new URL("https://discord.com/oauth2/authorize");
  target.search = new URLSearchParams({
    client_id: config.discordClientId,
    response_type: "code",
    redirect_uri: `${config.origin}/api/auth/callback/discord`,
    scope: "identify",
    state,
  }).toString();
  return new Response(null, {
    status: 303,
    headers: { Location: target.toString(), "Set-Cookie": secureCookie("oauth_state", state, 600) },
  });
}

async function finishDiscordLogin(request: Request, url: URL): Promise<Response> {
  const state = url.searchParams.get("state"),
    code = url.searchParams.get("code");
  if (
    !state ||
    cookie(request, "oauth_state") !== state ||
    !code ||
    !db
      .select({ state: oauthStates.state })
      .from(oauthStates)
      .where(and(eq(oauthStates.state, state), gt(oauthStates.expires_at, now())))
      .get()
  )
    return redirect("/login?error=oauth");
  db.delete(oauthStates).where(eq(oauthStates.state, state)).run();
  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.discordClientId,
      client_secret: config.discordClientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: `${config.origin}/api/auth/callback/discord`,
    }),
  });
  if (!tokenResponse.ok) return redirect("/login?error=oauth");
  const token = (await tokenResponse.json()) as { access_token: string };
  const profileResponse = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const profile = (await profileResponse.json()) as {
    id: string;
    username: string;
    global_name?: string;
    avatar?: string;
  };
  if (!config.allowedDiscordIds.has(profile.id)) return redirect("/login?error=forbidden");
  const timestamp = now(),
    avatar = profile.avatar
      ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png?size=128`
      : null;
  db.insert(users)
    .values({
      id: profile.id,
      username: profile.username,
      display_name: profile.global_name || profile.username,
      avatar,
      created_at: timestamp,
      updated_at: timestamp,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        username: profile.username,
        display_name: profile.global_name || profile.username,
        avatar,
        updated_at: timestamp,
      },
    })
    .run();
  const session = randomToken();
  db.insert(sessions)
    .values({
      token_hash: hash(session),
      user_id: profile.id,
      expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
    })
    .run();
  return new Response(null, {
    status: 303,
    headers: { Location: "/", "Set-Cookie": sessionCookie(session, 30 * 86400) },
  });
}

function sessionUser(request: Request): User | null {
  const token = cookie(request, "session");
  if (!token) return null;
  return (db
    .select({
      id: users.id,
      username: users.username,
      display_name: users.display_name,
      avatar: users.avatar,
      language: users.language,
      ctrl_enter_send: users.ctrl_enter_send,
      thinking_level: users.thinking_level,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.user_id))
    .where(and(eq(sessions.token_hash, hash(token)), gt(sessions.expires_at, now())))
    .get() ?? null) as User | null;
}
function ownedConversation(conversationId: string, userId: string) {
  return db
    .select({ id: conversationsTable.id, generation_status: conversationsTable.generation_status })
    .from(conversationsTable)
    .where(and(eq(conversationsTable.id, conversationId), eq(conversationsTable.user_id, userId)))
    .get();
}
function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\0/g, "").trim().slice(0, max) : "";
}
function hash(value: string): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex");
}
function randomToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
}
function cookie(request: Request, name: string): string | undefined {
  return request.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
function secureCookie(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${config.cookieSecure ? "; Secure" : ""}`;
}
function sessionCookie(value: string, maxAge: number): string {
  return secureCookie("session", value, maxAge);
}
function verifyOrigin(request: Request): void {
  if (request.headers.get("origin") !== config.origin) throw new Error("invalid origin");
}
function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}
function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}
async function webApp(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.set("accept-encoding", "identity");
  const streamed = request.method !== "GET" && request.method !== "HEAD";
  try {
    return await fetch(new URL(url.pathname + url.search, config.webOrigin), {
      method: request.method,
      headers,
      body: streamed ? request.body : undefined,
      redirect: "manual",
      ...(streamed ? { duplex: "half" } : {}),
    } as RequestInit);
  } catch {
    return new Response("web app is starting", {
      status: 503,
      headers: { "Retry-After": "2", "Cache-Control": "no-store" },
    });
  }
}
