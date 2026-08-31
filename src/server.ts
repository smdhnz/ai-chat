import { basename, extname, join } from "node:path";
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
        if (token) db.query("DELETE FROM sessions WHERE token_hash = ?").run(hash(token));
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
  icon: string;
  color: string;
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
type FileRow = { name: string; path: string; mime: string };

function bootstrap(user: User): Response {
  const projects = db
    .query(
      "SELECT id,name,system_prompt,icon,color,created_at,updated_at FROM projects WHERE user_id=? ORDER BY updated_at DESC",
    )
    .all(user.id) as ProjectRow[];
  const settings = resolveAiSettings(user.thinking_level);
  return json({
    user: { ...user, thinking_level: settings.thinking },
    supported_thinking_levels: supportedThinkingLevels(chatModel),
    model: { id: chatModel.id, supportedThinkingLevels: supportedThinkingLevels(chatModel) },
    projects,
    conversations: db
      .query(
        `SELECT c.id,c.project_id,c.title,c.temporary,c.generation_status,c.unread,c.created_at,c.updated_at,
         (SELECT r.id FROM runs r WHERE r.conversation_id=c.id AND r.status IN ('queued','running')
          ORDER BY r.created_at DESC LIMIT 1) AS activeRunId
         FROM conversations c WHERE c.user_id=? ORDER BY c.updated_at DESC`,
      )
      .all(user.id),
    files: db
      .query(
        "SELECT id,name,mime,size,source,created_at FROM files WHERE user_id=? ORDER BY created_at DESC LIMIT 200",
      )
      .all(user.id),
    skills: db
      .query(
        "SELECT id,name,description,instructions,enabled,created_at,updated_at FROM skills WHERE user_id=? ORDER BY updated_at DESC",
      )
      .all(user.id),
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
    db.query("SELECT id FROM projects WHERE id=? AND user_id=?").get(body.projectId, user.id);
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
  db.query(
    "INSERT INTO conversations(id,user_id,project_id,title,temporary,generation_status,unread,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
  ).run(
    conversation.id,
    user.id,
    conversation.project_id,
    conversation.title,
    conversation.temporary,
    conversation.generation_status,
    conversation.unread,
    conversation.created_at,
    conversation.updated_at,
  );
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
  db.query("UPDATE conversations SET unread=0 WHERE id=? AND user_id=?").run(
    conversationId,
    userId,
  );
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
      .query("SELECT 1 FROM runs WHERE conversation_id=? AND status IN ('queued','running')")
      .get(conversationId)
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
    db.query("UPDATE conversations SET title=? WHERE id=? AND user_id=?").run(
      clean(thinking.title, 100),
      conversationId,
      user.id,
    );
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
  })();
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
  db.query(
    "UPDATE users SET language=?,ctrl_enter_send=?,thinking_level=?,updated_at=? WHERE id=?",
  ).run(language, ctrlEnterSend, thinking, now(), userId);
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
  const body = (await request.json()) as {
    name?: string;
    systemPrompt?: string;
    icon?: string;
    color?: string;
  };
  const name = clean(body.name, 80);
  const prompt = clean(body.systemPrompt, 30_000);
  const icon = ["folder", "briefcase", "code", "book", "palette", "rocket"].includes(
    String(body.icon),
  )
    ? String(body.icon)
    : "folder";
  const color = ["clay", "blue", "green", "purple", "gold", "rose"].includes(String(body.color))
    ? String(body.color)
    : "clay";
  if (!name) return json({ error: "name is required" }, 400);
  const existing = db
    .query("SELECT id FROM projects WHERE id=? AND user_id=?")
    .get(projectId, userId);
  if (existing)
    db.query(
      "UPDATE projects SET name=?,system_prompt=?,icon=?,color=?,updated_at=? WHERE id=? AND user_id=?",
    ).run(name, prompt, icon, color, now(), projectId, userId);
  else
    db.query(
      "INSERT INTO projects(id,user_id,name,system_prompt,icon,color,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
    ).run(projectId, userId, name, prompt, icon, color, now(), now());
  return json(
    db
      .query(
        "SELECT id,name,system_prompt,icon,color,created_at,updated_at FROM projects WHERE id=?",
      )
      .get(projectId),
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
  const existing = db.query("SELECT id FROM skills WHERE id=? AND user_id=?").get(skillId, userId);
  if (existing)
    db.query(
      "UPDATE skills SET name=?,description=?,instructions=?,enabled=?,updated_at=? WHERE id=? AND user_id=?",
    ).run(name, description, instructions, enabled, now(), skillId, userId);
  else
    db.query(
      "INSERT INTO skills(id,user_id,name,description,instructions,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
    ).run(skillId, userId, name, description, instructions, enabled, now(), now());
  return json(
    db
      .query(
        "SELECT id,name,description,instructions,enabled,created_at,updated_at FROM skills WHERE id=?",
      )
      .get(skillId),
    existing ? 200 : 201,
  );
}

async function cleanupTemporaryConversations(): Promise<void> {
  const expired = db
    .query("SELECT id,user_id FROM conversations WHERE temporary=1 AND updated_at < ?")
    .all(new Date(Date.now() - 24 * 60 * 60_000).toISOString()) as {
    id: string;
    user_id: string;
  }[];
  for (const conversation of expired)
    await removeConversationData(conversation.id, conversation.user_id);
}

async function removeConversationData(conversationId: string, userId: string): Promise<void> {
  const files = fileRecords(allConversationFileIds(db, conversationId), userId);
  db.transaction(() => {
    db.query("DELETE FROM conversations WHERE id=? AND user_id=?").run(conversationId, userId);
    deleteFileRecords(files, userId);
  })();
  await removeFiles(files);
}

async function deleteAllData(request: Request, userId: string): Promise<Response> {
  verifyOrigin(request);
  const files = db.query("SELECT id,path FROM files WHERE user_id=?").all(userId) as {
    id: string;
    path: string;
  }[];
  db.transaction(() => {
    db.query("DELETE FROM conversations WHERE user_id=?").run(userId);
    db.query("DELETE FROM projects WHERE user_id=?").run(userId);
    deleteFileRecords(files, userId);
  })();
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
          (
            db
              .query("SELECT id FROM conversations WHERE project_id=? AND user_id=?")
              .all(objectId, userId) as { id: string }[]
          ).flatMap((conversation) => allConversationFileIds(db, conversation.id)),
          userId,
        )
      : [];
  db.transaction(() => {
    db.query(`DELETE FROM ${table} WHERE id=? AND user_id=?`).run(objectId, userId);
    deleteFileRecords(files, userId);
  })();
  await removeFiles(files);
  return new Response(null, { status: 204 });
}

function fileRecords(
  ids: string[],
  userId: string,
): { id: string; path: string; source: string }[] {
  const unique = [...new Set(ids)];
  return unique.length
    ? (db
        .query(
          `SELECT id,path,source FROM files WHERE user_id=? AND id IN (${unique.map(() => "?").join(",")})`,
        )
        .all(userId, ...unique) as { id: string; path: string; source: string }[])
    : [];
}

function deleteFileRecords(files: { id: string }[], userId: string): void {
  if (files.length)
    db.query(`DELETE FROM files WHERE user_id=? AND id IN (${files.map(() => "?").join(",")})`).run(
      userId,
      ...files.map((file) => file.id),
    );
}

async function removeFiles(files: { path: string }[]): Promise<void> {
  await Promise.all(files.map((file) => unlink(storedFilePath(file.path)).catch(() => undefined)));
}

async function serveUserFile(fileId: string, userId: string, download: boolean): Promise<Response> {
  const file = db
    .query("SELECT name,path,mime FROM files WHERE id=? AND user_id=?")
    .get(fileId, userId) as FileRow | null;
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
  db.query(
    "INSERT INTO files(id,user_id,name,path,mime,size,source,created_at) VALUES(?,?,?,?,?,?,?,?)",
  ).run(file.id, userId, file.name, file.path, file.mime, file.size, file.source, file.created_at);
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
        .query(
          `SELECT id,name,mime,size,source,created_at FROM files WHERE user_id=? AND id IN (${ids.map(() => "?").join(",")})`,
        )
        .all(userId, ...ids)
    : [];
}

function startDiscordLogin(): Response {
  const state = crypto.randomUUID();
  db.query("INSERT INTO oauth_states(state,expires_at) VALUES(?,?)").run(
    state,
    new Date(Date.now() + 10 * 60_000).toISOString(),
  );
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
    !db.query("SELECT state FROM oauth_states WHERE state=? AND expires_at>?").get(state, now())
  )
    return redirect("/login?error=oauth");
  db.query("DELETE FROM oauth_states WHERE state=?").run(state);
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
  db.query(
    `INSERT INTO users(id,username,display_name,avatar,created_at,updated_at) VALUES(?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET username=excluded.username,display_name=excluded.display_name,avatar=excluded.avatar,updated_at=excluded.updated_at`,
  ).run(
    profile.id,
    profile.username,
    profile.global_name || profile.username,
    avatar,
    timestamp,
    timestamp,
  );
  const session = randomToken();
  db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").run(
    hash(session),
    profile.id,
    new Date(Date.now() + 30 * 86400_000).toISOString(),
  );
  return new Response(null, {
    status: 303,
    headers: { Location: "/", "Set-Cookie": sessionCookie(session, 30 * 86400) },
  });
}

function sessionUser(request: Request): User | null {
  const token = cookie(request, "session");
  if (!token) return null;
  return db
    .query(
      `SELECT u.id,u.username,u.display_name,u.avatar,u.language,u.ctrl_enter_send,u.thinking_level FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>?`,
    )
    .get(hash(token), now()) as User | null;
}
function ownedConversation(conversationId: string, userId: string) {
  return db
    .query("SELECT id,generation_status FROM conversations WHERE id=? AND user_id=?")
    .get(conversationId, userId);
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
