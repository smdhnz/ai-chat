import { basename, extname, join } from "node:path";
import { and, desc, eq, gt, inArray, isNull, lt, ne, or } from "drizzle-orm";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import {
  classifyThinking,
  DEFAULT_THINKING_LEVEL,
  generateImage,
  getChatModel,
  resolveRunThinking,
  streamChat,
  summarizeConversation,
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
import { createImagePreview, imagePreviewPath, prepareImage } from "./images";
import { MESSAGE_PAGE_SIZE, regenerationIndex } from "./messages";
import {
  conversationAccess,
  conversationUserIds,
  fileAccess,
  markConversationUnread,
  projectAccess,
  projectUserIds,
  setConversationRead,
} from "./access";
import { buildSystemPrompt } from "./prompt";
import { builtinSkill, builtinSkills } from "./builtin-skills/catalog";
import { webSearch } from "./web-search";
import { importRegistrySkill, listRegistry } from "./skill-registry";
import {
  conversationReads,
  conversations as conversationsTable,
  files as filesTable,
  oauthStates,
  projectInvitations,
  projectMembers,
  projectSkills,
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
        return conversationAccess(db, url.pathname.slice(6), user.id)
          ? webApp(request)
          : redirect("/");

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
      if (url.pathname === "/api/skill-catalog/detail" && request.method === "GET")
        return skillCatalogDetail(url.searchParams.get("id") ?? "");
      if (url.pathname === "/api/skill-catalog" && request.method === "GET")
        return searchSkillCatalog(url.searchParams);
      if (url.pathname === "/api/skills/install" && request.method === "POST")
        return installSkill(request, user.id);
      const skillMatch = url.pathname.match(/^\/api\/skills\/([\w-]+)$/);
      if (skillMatch && request.method === "PUT") return saveSkill(request, user.id, skillMatch[1]);
      if (skillMatch && request.method === "DELETE")
        return deleteSkill(request, skillMatch[1], user.id);
      if (url.pathname === "/api/projects" && request.method === "POST")
        return saveProject(request, user.id);
      const projectMatch = url.pathname.match(/^\/api\/projects\/([\w-]+)$/);
      if (projectMatch && request.method === "PUT")
        return saveProject(request, user.id, projectMatch[1]);
      if (projectMatch && request.method === "DELETE")
        return deleteProject(request, projectMatch[1], user.id);
      const invitationMatch = url.pathname.match(
        /^\/api\/projects\/([\w-]+)\/invitations(?:\/([\w-]+))?$/,
      );
      if (invitationMatch && request.method === "POST")
        return inviteProjectMember(request, invitationMatch[1], user.id);
      if (invitationMatch?.[2] && request.method === "DELETE")
        return cancelProjectInvitation(request, invitationMatch[1], invitationMatch[2], user.id);
      const memberMatch = url.pathname.match(/^\/api\/projects\/([\w-]+)\/members\/([\w-]+)$/);
      if (memberMatch && request.method === "DELETE")
        return removeProjectMember(request, memberMatch[1], memberMatch[2], user.id);
      const leaveMatch = url.pathname.match(/^\/api\/projects\/([\w-]+)\/leave$/);
      if (leaveMatch && request.method === "POST")
        return leaveProject(request, leaveMatch[1], user.id);
      const invitationDecision = url.pathname.match(
        /^\/api\/invitations\/([\w-]+)\/(accept|decline)$/,
      );
      if (invitationDecision && request.method === "POST")
        return decideProjectInvitation(
          request,
          invitationDecision[1],
          user.id,
          invitationDecision[2] === "accept",
        );
      const fileMatch = url.pathname.match(/^\/files\/([\w-]+)$/);
      if (fileMatch && request.method === "GET")
        return serveUserFile(
          fileMatch[1],
          user.id,
          url.searchParams.has("download"),
          url.searchParams.has("preview"),
        );
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
  ctrl_enter_send: number;
  default_system_prompt: string;
};
type UserSummary = Pick<User, "id" | "username" | "display_name" | "avatar">;
type ProjectRow = {
  id: string;
  user_id: string;
  name: string;
  system_prompt: string;
  shared: number;
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
  const projectIds = accessibleProjectIds(user.id);
  const projectViews = projectIds
    .map((projectId) => projectView(projectId, user.id))
    .filter((project) => project !== null);
  const conversationRows = db
    .select({
      id: conversationsTable.id,
      project_id: conversationsTable.project_id,
      title: conversationsTable.title,
      temporary: conversationsTable.temporary,
      generation_status: conversationsTable.generation_status,
      created_at: conversationsTable.created_at,
      updated_at: conversationsTable.updated_at,
    })
    .from(conversationsTable)
    .where(
      or(
        and(isNull(conversationsTable.project_id), eq(conversationsTable.user_id, user.id)),
        projectIds.length
          ? and(
              inArray(conversationsTable.project_id, projectIds),
              or(eq(conversationsTable.temporary, 0), eq(conversationsTable.user_id, user.id)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(conversationsTable.updated_at))
    .all();
  const conversationIds = conversationRows.map((conversation) => conversation.id);
  const activeRuns = new Map(
    conversationIds.length
      ? db
          .select({ id: runsTable.id, conversation_id: runsTable.conversation_id })
          .from(runsTable)
          .where(
            and(
              inArray(runsTable.conversation_id, conversationIds),
              inArray(runsTable.status, ["queued", "running"]),
            ),
          )
          .orderBy(desc(runsTable.created_at))
          .all()
          .reverse()
          .map((run) => [run.conversation_id, run.id])
      : [],
  );
  const unread = new Map(
    conversationIds.length
      ? db
          .select({
            conversation_id: conversationReads.conversation_id,
            unread: conversationReads.unread,
          })
          .from(conversationReads)
          .where(
            and(
              eq(conversationReads.user_id, user.id),
              inArray(conversationReads.conversation_id, conversationIds),
            ),
          )
          .all()
          .map((read) => [read.conversation_id, read.unread])
      : [],
  );
  const fileIds = [
    ...new Set([
      ...db
        .select({ id: filesTable.id })
        .from(filesTable)
        .where(eq(filesTable.user_id, user.id))
        .all()
        .map((file) => file.id),
      ...conversationIds.flatMap((conversationId) => allConversationFileIds(db, conversationId)),
    ]),
  ];
  return json({
    user,
    users: projectViews.some((project) => project.is_owner)
      ? db
          .select({
            id: users.id,
            username: users.username,
            display_name: users.display_name,
            avatar: users.avatar,
          })
          .from(users)
          .orderBy(users.display_name)
          .all()
      : [],
    invitations: incomingInvitations(user.id),
    projects: projectViews,
    skills: [
      ...builtinSkills.map((skill) => ({
        id: `builtin:${skill.name}`,
        name: skill.name,
        description: skill.description,
        instructions: "",
        enabled: 1,
        source: "builtin" as const,
        source_id: null,
        editable: false,
        created_at: null,
        updated_at: null,
      })),
      ...db
        .select({
          id: skillsTable.id,
          name: skillsTable.name,
          description: skillsTable.description,
          instructions: skillsTable.instructions,
          enabled: skillsTable.enabled,
          source_id: skillsTable.source_id,
          created_at: skillsTable.created_at,
          updated_at: skillsTable.updated_at,
        })
        .from(skillsTable)
        .where(eq(skillsTable.user_id, user.id))
        .orderBy(desc(skillsTable.updated_at))
        .all()
        .map((skill) => ({
          ...skill,
          source: skill.source_id ? ("skills.sh" as const) : ("legacy" as const),
          editable: true,
        })),
    ],
    conversations: conversationRows.map((conversation) => ({
      ...conversation,
      unread: unread.get(conversation.id) ?? 0,
      activeRunId: activeRuns.get(conversation.id) ?? null,
    })),
    files: fileIds.length
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
          .where(inArray(filesTable.id, fileIds))
          .orderBy(desc(filesTable.created_at))
          .limit(200)
          .all()
      : [],
  });
}

async function createConversation(request: Request, user: User): Promise<Response> {
  verifyOrigin(request);
  const body = (await request.json()) as {
    projectId?: string;
    title?: string;
    temporary?: boolean;
  };
  const project = body.projectId ? projectAccess(db, body.projectId, user.id) : null;
  if (body.projectId && !project) return json({ error: "project not found" }, 404);
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
  const recipients = conversationUserIds(db, conversation.id);
  for (const memberId of recipients) setConversationRead(db, conversation.id, memberId);
  publishSync(recipients, conversation.id);
  return json(conversation, 201);
}

function userTopic(userId: string): string {
  return `user:${userId}`;
}

function publishAgentEvent(_userId: string, envelope: ChatEventEnvelope): void {
  const payload = JSON.stringify(envelope);
  for (const recipient of conversationUserIds(db, envelope.conversationId))
    server.publish(userTopic(recipient), payload);
}

function publishSync(userIds: string[], conversationId?: string): void {
  const payload = JSON.stringify({ type: "sync", conversationId });
  for (const userId of new Set(userIds)) server.publish(userTopic(userId), payload);
}

function userSummary(userId: string): UserSummary | null {
  return (
    db
      .select({
        id: users.id,
        username: users.username,
        display_name: users.display_name,
        avatar: users.avatar,
      })
      .from(users)
      .where(eq(users.id, userId))
      .get() ?? null
  );
}

function accessibleProjectIds(userId: string): string[] {
  return [
    ...new Set([
      ...db
        .select({ id: projectsTable.id })
        .from(projectsTable)
        .where(eq(projectsTable.user_id, userId))
        .all()
        .map((project) => project.id),
      ...db
        .select({ id: projectMembers.project_id })
        .from(projectMembers)
        .where(eq(projectMembers.user_id, userId))
        .all()
        .map((project) => project.id),
    ]),
  ];
}

function projectView(projectId: string, userId: string) {
  const access = projectAccess(db, projectId, userId);
  if (!access) return null;
  const project = db
    .select({
      id: projectsTable.id,
      user_id: projectsTable.user_id,
      name: projectsTable.name,
      system_prompt: projectsTable.system_prompt,
      shared: projectsTable.shared,
      created_at: projectsTable.created_at,
      updated_at: projectsTable.updated_at,
    })
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId))
    .get() as ProjectRow;
  const members = db
    .select({ user_id: projectMembers.user_id })
    .from(projectMembers)
    .where(eq(projectMembers.project_id, projectId))
    .all()
    .flatMap((member) => {
      const user = userSummary(member.user_id);
      return user ? [user] : [];
    });
  const pending_invitations = db
    .select({ user_id: projectInvitations.user_id })
    .from(projectInvitations)
    .where(eq(projectInvitations.project_id, projectId))
    .all()
    .flatMap((invitation) => {
      const user = userSummary(invitation.user_id);
      return user ? [user] : [];
    });
  const installedSkills = db
    .select({
      id: projectSkills.id,
      name: projectSkills.name,
      description: projectSkills.description,
      instructions: projectSkills.instructions,
      enabled: projectSkills.enabled,
      source_id: projectSkills.source_id,
      created_at: projectSkills.created_at,
      updated_at: projectSkills.updated_at,
    })
    .from(projectSkills)
    .where(eq(projectSkills.project_id, projectId))
    .orderBy(desc(projectSkills.updated_at))
    .all()
    .map((skill) => ({ ...skill, source: "skills.sh" as const, editable: access.isOwner }));
  return {
    ...project,
    owner: userSummary(project.user_id)!,
    members,
    pending_invitations,
    skills: installedSkills,
    is_owner: access.isOwner,
    shared: project.shared === 1,
  };
}

function incomingInvitations(userId: string) {
  return db
    .select({ project_id: projectInvitations.project_id })
    .from(projectInvitations)
    .where(eq(projectInvitations.user_id, userId))
    .all()
    .flatMap((invitation) => {
      const project = db
        .select({ id: projectsTable.id, name: projectsTable.name, user_id: projectsTable.user_id })
        .from(projectsTable)
        .where(eq(projectsTable.id, invitation.project_id))
        .get();
      if (!project) return [];
      return [
        {
          project_id: project.id,
          project_name: project.name,
          owner: userSummary(project.user_id)!,
        },
      ];
    });
}

function conversationMessages(
  conversationId: string,
  userId: string,
  before: string | null,
): Response {
  const access = conversationAccess(db, conversationId, userId);
  if (!access) return json({ error: "not found" }, 404);
  setConversationRead(db, conversationId, userId);
  let page;
  try {
    page = pagePublicMessages(db, conversationId, before, MESSAGE_PAGE_SIZE);
  } catch (error) {
    if (error instanceof Error && error.message === "invalid cursor")
      return json({ error: "invalid cursor" }, 400);
    throw error;
  }
  return json({
    messages: page.messages.map(({ fileIds, authorId, ...message }) => ({
      ...message,
      author: message.role === "user" ? userSummary(authorId ?? access.creator_id) : undefined,
      files: filesByIds(fileIds),
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
  const access = conversationAccess(db, conversationId, userId);
  if (!access?.isOwner) return json({ error: "not found" }, 404);
  await conversationRunner.stop(conversationId, userId);
  const recipients = conversationUserIds(db, conversationId);
  await removeConversationData(conversationId);
  publishSync(recipients);
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
  const conversation = conversationAccess(db, conversationId, user.id);
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
    authorId: user.id,
    createdAt: timestamp,
  });
  db.update(conversationsTable)
    .set({ updated_at: timestamp })
    .where(eq(conversationsTable.id, conversationId))
    .run();
  markConversationUnread(db, conversationId, user.id);
  publishSync(conversationUserIds(db, conversationId), conversationId);
  await startGeneration(conversationId, user, message.id);
  return json({ message: { ...message, author: userSummary(user.id) }, status: "running" }, 202);
}

async function startGeneration(
  conversationId: string,
  user: User,
  userEntryId: string,
): Promise<void> {
  const messages = listLegacyMessages(db, conversationId) as HistoryRow[];
  const latest = messages.at(-1);
  if (!latest || latest.id !== userEntryId || latest.role !== "user")
    throw new Error("latest user message not found");
  const needsTitle = messages.filter((message) => message.role === "user").length === 1;
  const thinking = await resolveRunThinking(
    DEFAULT_THINKING_LEVEL,
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
  if (needsTitle && thinking.title)
    publishSync(conversationUserIds(db, conversationId), conversationId);
  await conversationRunner.start({
    conversationId,
    userId: user.id,
    userEntryId,
    systemPrompt: buildSystemPrompt(db, conversationId, user.id),
    requestedThinking: DEFAULT_THINKING_LEVEL,
    resolvedThinking: thinking.resolved,
  });
}

async function stopGeneration(
  request: Request,
  conversationId: string,
  userId: string,
): Promise<Response> {
  verifyOrigin(request);
  if (!conversationAccess(db, conversationId, userId)) return json({ error: "not found" }, 404);
  await conversationRunner.stop(conversationId, userId);
  return new Response(null, { status: 204 });
}

async function regenerate(request: Request, conversationId: string, user: User): Promise<Response> {
  verifyOrigin(request);
  const conversation = conversationAccess(db, conversationId, user.id);
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
    removedFiles = fileRecords(fileIdsBefore.filter((fileId) => !retained.has(fileId))).filter(
      (file) => file.source === "generated",
    );
    deleteFileRecords(removedFiles);
  });
  await removeFiles(removedFiles);
  markConversationUnread(db, conversationId, user.id);
  publishSync(conversationUserIds(db, conversationId), conversationId);
  await startGeneration(conversationId, user, userMessage.id);
  return json({ status: "running" }, 202);
}

async function saveSettings(request: Request, userId: string): Promise<Response> {
  verifyOrigin(request);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    (typeof body.ctrlEnterSend !== "boolean" && typeof body.defaultSystemPrompt !== "string") ||
    (typeof body.defaultSystemPrompt === "string" && body.defaultSystemPrompt.length > 30_000)
  )
    return json({ error: "invalid settings" }, 400);
  const updates: { ctrl_enter_send?: number; default_system_prompt?: string; updated_at: string } =
    {
      updated_at: now(),
    };
  if (typeof body.ctrlEnterSend === "boolean") updates.ctrl_enter_send = body.ctrlEnterSend ? 1 : 0;
  if (typeof body.defaultSystemPrompt === "string")
    updates.default_system_prompt = clean(body.defaultSystemPrompt, 30_000);
  db.update(users).set(updates).where(eq(users.id, userId)).run();
  return json(updates);
}

type SkillInput = {
  name: string;
  description: string;
  instructions: string;
  enabled: number;
};

async function searchSkillCatalog(params: URLSearchParams): Promise<Response> {
  const query = params.get("query")?.trim() ?? "";
  const offsetValue = params.get("offset") ?? "";
  const limitValue = params.get("limit") ?? "";
  if (
    query.length > 100 ||
    !/^\d+$/.test(offsetValue) ||
    !/^\d+$/.test(limitValue) ||
    Number(limitValue) !== 10
  )
    return json({ error: "invalid catalog query" }, 400);
  try {
    return json(
      await listRegistry(
        query,
        Number(offsetValue),
        Number(limitValue),
        AbortSignal.timeout(10_000),
      ),
    );
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "取得できませんでした" }, 502);
  }
}

async function skillCatalogDetail(catalogId: string): Promise<Response> {
  if (!catalogId.trim()) return json({ error: "invalid skill" }, 400);
  try {
    const detail = await importRegistrySkill(catalogId.trim(), AbortSignal.timeout(30_000));
    return json({
      name: detail.name,
      description: detail.description,
      files: detail.files.map((file) => ({ path: file.path })),
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "取得できませんでした" }, 502);
  }
}

async function installSkill(request: Request, userId: string): Promise<Response> {
  verifyOrigin(request);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const catalogId = typeof body?.catalogId === "string" ? body.catalogId.trim() : "";
  const projectId = typeof body?.projectId === "string" ? body.projectId : null;
  if (!catalogId) return json({ error: "invalid skill" }, 400);
  if (projectId && !projectAccess(db, projectId, userId)?.isOwner)
    return json({ error: "project not found" }, 404);
  const imported = await importRegistrySkill(catalogId, AbortSignal.timeout(30_000));
  if (builtinSkill(imported.name)) return json({ error: "skill name is reserved" }, 409);
  const timestamp = now();
  if (projectId) {
    const duplicate = db
      .select({ id: projectSkills.id })
      .from(projectSkills)
      .where(
        and(
          eq(projectSkills.project_id, projectId),
          or(eq(projectSkills.name, imported.name), eq(projectSkills.source_id, catalogId)),
        ),
      )
      .get();
    if (duplicate) return json({ error: "skill already installed" }, 409);
    db.insert(projectSkills)
      .values({
        id: id(),
        project_id: projectId,
        name: imported.name,
        description: imported.description,
        instructions: imported.instructions,
        files: JSON.stringify(imported.files),
        source_id: imported.sourceId,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .run();
    publishSync(projectUserIds(db, projectId));
  } else {
    const duplicate = db
      .select({ id: skillsTable.id })
      .from(skillsTable)
      .where(
        and(
          eq(skillsTable.user_id, userId),
          or(eq(skillsTable.name, imported.name), eq(skillsTable.source_id, catalogId)),
        ),
      )
      .get();
    if (duplicate) return json({ error: "skill already installed" }, 409);
    db.insert(skillsTable)
      .values({
        id: id(),
        user_id: userId,
        name: imported.name,
        description: imported.description,
        instructions: imported.instructions,
        files: JSON.stringify(imported.files),
        source_id: imported.sourceId,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .run();
  }
  return json({ installed: true }, 201);
}

async function saveSkill(request: Request, userId: string, skillId: string): Promise<Response> {
  verifyOrigin(request);
  const input = skillInput(await request.json().catch(() => null));
  if (!input) return json({ error: "invalid skill" }, 400);
  if (builtinSkill(input.name)) return json({ error: "skill name is reserved" }, 409);
  const general = db
    .select({ id: skillsTable.id })
    .from(skillsTable)
    .where(and(eq(skillsTable.id, skillId), eq(skillsTable.user_id, userId)))
    .get();
  if (general) {
    const duplicate = db
      .select({ id: skillsTable.id })
      .from(skillsTable)
      .where(
        and(
          eq(skillsTable.user_id, userId),
          eq(skillsTable.name, input.name),
          ne(skillsTable.id, skillId),
        ),
      )
      .get();
    if (duplicate) return json({ error: "skill name already exists" }, 409);
    db.update(skillsTable)
      .set({ ...input, updated_at: now() })
      .where(eq(skillsTable.id, skillId))
      .run();
    return json({ saved: true });
  }
  const project = db
    .select({ project_id: projectSkills.project_id })
    .from(projectSkills)
    .where(eq(projectSkills.id, skillId))
    .get();
  if (!project || !projectAccess(db, project.project_id, userId)?.isOwner)
    return json({ error: "skill not found" }, 404);
  const duplicate = db
    .select({ id: projectSkills.id })
    .from(projectSkills)
    .where(
      and(
        eq(projectSkills.project_id, project.project_id),
        eq(projectSkills.name, input.name),
        ne(projectSkills.id, skillId),
      ),
    )
    .get();
  if (duplicate) return json({ error: "skill name already exists" }, 409);
  db.update(projectSkills)
    .set({ ...input, updated_at: now() })
    .where(eq(projectSkills.id, skillId))
    .run();
  publishSync(projectUserIds(db, project.project_id));
  return json({ saved: true });
}

function deleteSkill(request: Request, skillId: string, userId: string): Response {
  verifyOrigin(request);
  const general = db
    .select({ id: skillsTable.id })
    .from(skillsTable)
    .where(and(eq(skillsTable.id, skillId), eq(skillsTable.user_id, userId)))
    .get();
  if (general) db.delete(skillsTable).where(eq(skillsTable.id, skillId)).run();
  else {
    const project = db
      .select({ project_id: projectSkills.project_id })
      .from(projectSkills)
      .where(eq(projectSkills.id, skillId))
      .get();
    if (!project || !projectAccess(db, project.project_id, userId)?.isOwner)
      return json({ error: "skill not found" }, 404);
    db.delete(projectSkills).where(eq(projectSkills.id, skillId)).run();
    publishSync(projectUserIds(db, project.project_id));
  }
  return new Response(null, { status: 204 });
}

function skillInput(value: unknown): SkillInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (
    typeof body.name !== "string" ||
    typeof body.description !== "string" ||
    typeof body.instructions !== "string" ||
    typeof body.enabled !== "boolean"
  )
    return null;
  const name = body.name.replace(/\0/g, "").trim();
  const description = body.description.replace(/\0/g, "").trim();
  const instructions = body.instructions.replace(/\0/g, "").trim();
  if (
    !name ||
    name.length > 80 ||
    description.length > 500 ||
    !instructions ||
    instructions.length > 30_000
  )
    return null;
  return { name, description, instructions, enabled: body.enabled ? 1 : 0 };
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
  if (existing) {
    db.update(projectsTable)
      .set({ name, system_prompt: prompt, updated_at: now() })
      .where(and(eq(projectsTable.id, projectId), eq(projectsTable.user_id, userId)))
      .run();
    publishSync(projectUserIds(db, projectId));
  } else {
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
    publishSync([userId]);
  }
  return json(projectView(projectId, userId), existing ? 200 : 201);
}

async function inviteProjectMember(
  request: Request,
  projectId: string,
  ownerId: string,
): Promise<Response> {
  verifyOrigin(request);
  if (!projectAccess(db, projectId, ownerId)?.isOwner) return json({ error: "not found" }, 404);
  const body = (await request.json()) as { userId?: string };
  const userId = clean(body.userId, 100);
  if (!userId || userId === ownerId || !userSummary(userId))
    return json({ error: "invalid user" }, 400);
  if (
    db
      .select({ user_id: projectMembers.user_id })
      .from(projectMembers)
      .where(and(eq(projectMembers.project_id, projectId), eq(projectMembers.user_id, userId)))
      .get()
  )
    return json({ error: "already a member" }, 409);
  db.insert(projectInvitations)
    .values({ project_id: projectId, user_id: userId, created_at: now() })
    .onConflictDoNothing()
    .run();
  publishSync([...projectUserIds(db, projectId), userId]);
  return json(projectView(projectId, ownerId), 201);
}

async function cancelProjectInvitation(
  request: Request,
  projectId: string,
  invitedUserId: string,
  ownerId: string,
): Promise<Response> {
  verifyOrigin(request);
  if (!projectAccess(db, projectId, ownerId)?.isOwner) return json({ error: "not found" }, 404);
  db.delete(projectInvitations)
    .where(
      and(
        eq(projectInvitations.project_id, projectId),
        eq(projectInvitations.user_id, invitedUserId),
      ),
    )
    .run();
  publishSync([...projectUserIds(db, projectId), invitedUserId]);
  return json(projectView(projectId, ownerId));
}

async function decideProjectInvitation(
  request: Request,
  projectId: string,
  userId: string,
  accept: boolean,
): Promise<Response> {
  verifyOrigin(request);
  const invitation = db
    .select({ project_id: projectInvitations.project_id })
    .from(projectInvitations)
    .where(
      and(eq(projectInvitations.project_id, projectId), eq(projectInvitations.user_id, userId)),
    )
    .get();
  if (!invitation) return json({ error: "not found" }, 404);
  db.transaction((tx) => {
    tx.delete(projectInvitations)
      .where(
        and(eq(projectInvitations.project_id, projectId), eq(projectInvitations.user_id, userId)),
      )
      .run();
    if (accept) {
      tx.update(projectsTable).set({ shared: 1 }).where(eq(projectsTable.id, projectId)).run();
      tx.insert(projectMembers)
        .values({ project_id: projectId, user_id: userId, created_at: now() })
        .onConflictDoNothing()
        .run();
    }
  });
  if (accept)
    for (const conversation of db
      .select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(eq(conversationsTable.project_id, projectId))
      .all())
      setConversationRead(db, conversation.id, userId);
  publishSync([...projectUserIds(db, projectId), userId]);
  return new Response(null, { status: 204 });
}

async function removeProjectMember(
  request: Request,
  projectId: string,
  memberId: string,
  ownerId: string,
): Promise<Response> {
  verifyOrigin(request);
  if (!projectAccess(db, projectId, ownerId)?.isOwner) return json({ error: "not found" }, 404);
  removeMembership(projectId, memberId);
  publishSync([...projectUserIds(db, projectId), memberId]);
  return new Response(null, { status: 204 });
}

async function leaveProject(
  request: Request,
  projectId: string,
  userId: string,
): Promise<Response> {
  verifyOrigin(request);
  const access = projectAccess(db, projectId, userId);
  if (!access || access.isOwner) return json({ error: "not found" }, 404);
  removeMembership(projectId, userId);
  publishSync([...projectUserIds(db, projectId), userId]);
  return new Response(null, { status: 204 });
}

function removeMembership(projectId: string, userId: string): void {
  const conversationIds = db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(eq(conversationsTable.project_id, projectId))
    .all()
    .map((conversation) => conversation.id);
  db.transaction((tx) => {
    tx.delete(projectMembers)
      .where(and(eq(projectMembers.project_id, projectId), eq(projectMembers.user_id, userId)))
      .run();
    if (conversationIds.length)
      tx.delete(conversationReads)
        .where(
          and(
            eq(conversationReads.user_id, userId),
            inArray(conversationReads.conversation_id, conversationIds),
          ),
        )
        .run();
  });
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
  for (const conversation of expired) await removeConversationData(conversation.id);
}

async function removeConversationData(conversationId: string): Promise<void> {
  const files = fileRecords(allConversationFileIds(db, conversationId));
  db.transaction((tx) => {
    tx.delete(conversationsTable).where(eq(conversationsTable.id, conversationId)).run();
    deleteFileRecords(files);
  });
  await removeFiles(files);
}

async function deleteAllData(request: Request, userId: string): Promise<Response> {
  verifyOrigin(request);
  const joinedProjectIds = db
    .select({ id: projectMembers.project_id })
    .from(projectMembers)
    .where(eq(projectMembers.user_id, userId))
    .all()
    .map((project) => project.id);
  const ownedProjectRows = db
    .select({ id: projectsTable.id, shared: projectsTable.shared })
    .from(projectsTable)
    .where(eq(projectsTable.user_id, userId))
    .all();
  const ownedProjects = ownedProjectRows.map((project) => project.id);
  const protectedProjectIds = new Set([
    ...joinedProjectIds,
    ...ownedProjectRows.filter((project) => project.shared === 1).map((project) => project.id),
  ]);
  const deletedProjectIds = ownedProjects.filter(
    (projectId) => !protectedProjectIds.has(projectId),
  );
  const conversationRows = db
    .select({
      id: conversationsTable.id,
      user_id: conversationsTable.user_id,
      project_id: conversationsTable.project_id,
    })
    .from(conversationsTable)
    .all();
  const deletedConversationIds = conversationRows
    .filter(
      (conversation) =>
        (!conversation.project_id && conversation.user_id === userId) ||
        (conversation.project_id && deletedProjectIds.includes(conversation.project_id)),
    )
    .map((conversation) => conversation.id);
  const retainedFileIds = new Set(
    conversationRows
      .filter((conversation) => !deletedConversationIds.includes(conversation.id))
      .flatMap((conversation) => allConversationFileIds(db, conversation.id)),
  );
  const deletedFileIds = new Set(
    deletedConversationIds.flatMap((conversationId) => allConversationFileIds(db, conversationId)),
  );
  const files = db
    .select({
      id: filesTable.id,
      user_id: filesTable.user_id,
      path: filesTable.path,
      source: filesTable.source,
    })
    .from(filesTable)
    .all()
    .filter(
      (file) =>
        !retainedFileIds.has(file.id) && (file.user_id === userId || deletedFileIds.has(file.id)),
    );
  for (const conversationId of deletedConversationIds)
    await conversationRunner.stop(conversationId, userId);
  db.transaction((tx) => {
    if (deletedConversationIds.length)
      tx.delete(conversationsTable)
        .where(inArray(conversationsTable.id, deletedConversationIds))
        .run();
    if (deletedProjectIds.length)
      tx.delete(projectsTable).where(inArray(projectsTable.id, deletedProjectIds)).run();
    deleteFileRecords(files);
  });
  await removeFiles(files);
  publishSync([userId]);
  return new Response(null, { status: 204 });
}

async function deleteProject(
  request: Request,
  projectId: string,
  userId: string,
): Promise<Response> {
  verifyOrigin(request);
  if (!projectAccess(db, projectId, userId)?.isOwner) return json({ error: "not found" }, 404);
  const conversationIds = db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(eq(conversationsTable.project_id, projectId))
    .all()
    .map((conversation) => conversation.id);
  const files = fileRecords(
    conversationIds.flatMap((conversationId) => allConversationFileIds(db, conversationId)),
  );
  const invited = db
    .select({ user_id: projectInvitations.user_id })
    .from(projectInvitations)
    .where(eq(projectInvitations.project_id, projectId))
    .all()
    .map((invitation) => invitation.user_id);
  const recipients = [...projectUserIds(db, projectId), ...invited];
  for (const conversationId of conversationIds)
    await conversationRunner.stop(conversationId, userId);
  db.transaction((tx) => {
    tx.delete(projectsTable)
      .where(and(eq(projectsTable.id, projectId), eq(projectsTable.user_id, userId)))
      .run();
    deleteFileRecords(files);
  });
  await removeFiles(files);
  publishSync(recipients);
  return new Response(null, { status: 204 });
}

function fileRecords(ids: string[]): { id: string; path: string; source: string }[] {
  const unique = [...new Set(ids)];
  return unique.length
    ? db
        .select({ id: filesTable.id, path: filesTable.path, source: filesTable.source })
        .from(filesTable)
        .where(inArray(filesTable.id, unique))
        .all()
    : [];
}

function deleteFileRecords(files: { id: string }[]): void {
  if (files.length)
    db.delete(filesTable)
      .where(
        inArray(
          filesTable.id,
          files.map((file) => file.id),
        ),
      )
      .run();
}

async function removeFiles(files: { path: string }[]): Promise<void> {
  await Promise.all(
    files.flatMap((file) => {
      const path = storedFilePath(file.path);
      return [path, imagePreviewPath(path)].map((target) => unlink(target).catch(() => undefined));
    }),
  );
}

async function serveUserFile(
  fileId: string,
  userId: string,
  download: boolean,
  preview: boolean,
): Promise<Response> {
  if (!fileAccess(db, fileId, userId)) return json({ error: "not found" }, 404);
  const file = db
    .select({ name: filesTable.name, path: filesTable.path, mime: filesTable.mime })
    .from(filesTable)
    .where(eq(filesTable.id, fileId))
    .get();
  if (!file) return json({ error: "not found" }, 404);
  const originalPath = storedFilePath(file.path);
  if (!(await Bun.file(originalPath).exists())) return json({ error: "not found" }, 404);
  const path = preview ? imagePreviewPath(originalPath) : originalPath;
  if (preview && !(await Bun.file(path).exists()))
    await writeFile(
      path,
      await createImagePreview(Buffer.from(await Bun.file(originalPath).arrayBuffer()), file.mime),
    );
  return new Response(Bun.file(path), {
    headers: {
      "Content-Type": preview ? "image/webp" : file.mime,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, max-age=31536000, immutable",
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
    const fileId = id();
    const originalName = clean(basename(entry.name), 255) || "file";
    const image = await prepareImage(Buffer.from(await entry.arrayBuffer()), entry.type);
    const originalExtension = extname(originalName);
    const name =
      image.mime === entry.type
        ? originalName
        : `${originalExtension ? originalName.slice(0, -originalExtension.length) : originalName}${image.extension}`;
    const directory = join(
      config.dataDir,
      "users",
      userId,
      "files",
      new Date().toISOString().slice(0, 10),
    );
    await mkdir(directory, { recursive: true });
    const path = join(directory, `${fileId}${image.extension}`);
    await Promise.all([
      writeFile(path, image.bytes),
      writeFile(imagePreviewPath(path), image.preview),
    ]);
    const file = {
      id: fileId,
      name,
      path,
      mime: image.mime,
      size: image.bytes.length,
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
function filesByIds(ids: string[]) {
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
        .where(inArray(filesTable.id, ids))
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
      ctrl_enter_send: users.ctrl_enter_send,
      default_system_prompt: users.default_system_prompt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.user_id))
    .where(and(eq(sessions.token_hash, hash(token)), gt(sessions.expires_at, now())))
    .get() ?? null) as User | null;
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
