import { desc, eq, lt } from "drizzle-orm";
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { allConversationFileIds } from "./agent-messages";
import { config } from "./config";
import type { Database } from "./database";
import { serveStoredFile } from "./files";
import { publicMessagePage } from "./public-messages";
import { conversations, projects, users } from "./schema";

export function isAdmin(userId: string): boolean {
  return config.adminDiscordIds.has(userId) && config.allowedDiscordIds.has(userId);
}

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const conversationColumns = {
  id: conversations.id,
  user_id: conversations.user_id,
  display_name: users.display_name,
  project_id: conversations.project_id,
  project_name: projects.name,
  title: conversations.title,
  temporary: conversations.temporary,
  generation_status: conversations.generation_status,
  shared: projects.shared,
  created_at: conversations.created_at,
  updated_at: conversations.updated_at,
};

type AuditTarget = { user_id: string; id: string };

// Keep audit records outside user data so normal deletion cannot erase them.
async function audit(viewerId: string, targets: AuditTarget[], action: string, fileId?: string) {
  if (!targets.length) return;
  const timestamp = new Date().toISOString();
  await appendFile(
    join(config.dataDir, "admin-audit.jsonl"),
    targets
      .map((target) =>
        JSON.stringify({
          timestamp,
          viewer_id: viewerId,
          action,
          user_id: target.user_id,
          conversation_id: target.id,
          ...(fileId ? { file_id: fileId } : {}),
        }),
      )
      .join("\n") + "\n",
    { mode: 0o600 },
  );
}

export async function adminRequest(
  request: Request,
  database: Database,
  userId: string | null,
): Promise<Response> {
  if (!userId) return json({ error: "unauthorized" }, 401);
  if (!isAdmin(userId)) return json({ error: "forbidden" }, 403);
  if (request.method !== "GET") return json({ error: "read only" }, 405);
  const url = new URL(request.url);
  const before = url.searchParams.get("before");
  if (before !== null && !/^[\w-]{1,100}$/.test(before))
    return json({ error: "invalid cursor" }, 400);

  if (url.pathname === "/api/admin/conversations") {
    const rows = database
      .select(conversationColumns)
      .from(conversations)
      .innerJoin(users, eq(users.id, conversations.user_id))
      .leftJoin(projects, eq(projects.id, conversations.project_id))
      .where(before ? lt(conversations.id, before) : undefined)
      .orderBy(desc(conversations.id))
      .limit(51)
      .all();
    const page = rows.slice(0, 50);
    await audit(userId, page, "list");
    return json({ conversations: page, hasMore: rows.length > 50 });
  }

  const match = url.pathname.match(
    /^\/api\/admin\/conversations\/([\w-]+)(?:\/(?:files|images)\/([\w-]+))?$/,
  );
  if (!match) return json({ error: "not found" }, 404);
  const conversation = database
    .select(conversationColumns)
    .from(conversations)
    .innerJoin(users, eq(users.id, conversations.user_id))
    .leftJoin(projects, eq(projects.id, conversations.project_id))
    .where(eq(conversations.id, match[1]))
    .get();
  if (!conversation) return json({ error: "not found" }, 404);

  const fileId = match[2];
  if (fileId) {
    if (!allConversationFileIds(database, conversation.id).includes(fileId))
      return json({ error: "not found" }, 404);
    const response = await serveStoredFile(
      database,
      fileId,
      url.searchParams.has("download"),
      url.searchParams.has("preview"),
      "no-store",
    );
    if (response.ok) await audit(userId, [conversation], "file", fileId);
    return response;
  }

  let page;
  try {
    page = publicMessagePage(database, conversation.id, conversation.user_id, before);
  } catch (error) {
    if (error instanceof Error && error.message === "invalid cursor")
      return json({ error: "invalid cursor" }, 400);
    throw error;
  }
  await audit(userId, [conversation], "conversation");
  return json({ conversation, ...page });
}

export async function authorizeAdminStream(
  database: Database,
  userId: string,
  conversationId: string,
): Promise<Response | undefined> {
  if (!isAdmin(userId)) return json({ error: "forbidden" }, 403);
  const conversation = database
    .select({ id: conversations.id, user_id: conversations.user_id })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .get();
  if (!conversation) return json({ error: "not found" }, 404);
  await audit(userId, [conversation], "stream");
}

export function adminConversationTopic(conversationId: string): string {
  return `admin-conversation:${conversationId}`;
}
