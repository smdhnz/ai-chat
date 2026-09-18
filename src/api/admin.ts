import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { allConversationFileIds, detectImageMime, pagePublicMessages } from "./agent-messages";
import { config, storedFilePath } from "./config";
import type { Database } from "./database";
import { createImagePreview } from "./images";
import { MESSAGE_PAGE_SIZE } from "./messages";
import { conversations, files, users } from "./schema";

export function isAdmin(userId: string): boolean {
  return config.adminDiscordIds.has(userId) && config.allowedDiscordIds.has(userId);
}

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const imageMimes = ["image/png", "image/jpeg", "image/webp", "image/gif"];

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
      .select({
        id: conversations.id,
        user_id: conversations.user_id,
        display_name: users.display_name,
        title: conversations.title,
        temporary: conversations.temporary,
        created_at: conversations.created_at,
        updated_at: conversations.updated_at,
      })
      .from(conversations)
      .innerJoin(users, eq(users.id, conversations.user_id))
      .where(before ? lt(conversations.id, before) : undefined)
      .orderBy(desc(conversations.id))
      .limit(51)
      .all();
    const page = rows.slice(0, 50);
    await audit(userId, page, "list");
    return json({ conversations: page, hasMore: rows.length > 50 });
  }

  const match = url.pathname.match(
    /^\/api\/admin\/conversations\/([\w-]+)(?:\/images\/([\w-]+))?$/,
  );
  if (!match) return json({ error: "not found" }, 404);
  const conversation = database
    .select({ id: conversations.id, user_id: conversations.user_id })
    .from(conversations)
    .where(eq(conversations.id, match[1]))
    .get();
  if (!conversation) return json({ error: "not found" }, 404);

  const fileId = match[2];
  if (fileId) {
    if (!allConversationFileIds(database, conversation.id).includes(fileId))
      return json({ error: "not found" }, 404);
    const file = database
      .select({ path: files.path, mime: files.mime })
      .from(files)
      .where(and(eq(files.id, fileId), inArray(files.mime, imageMimes)))
      .get();
    if (!file) return json({ error: "not found" }, 404);
    const source = Bun.file(storedFilePath(file.path));
    if (!(await source.exists())) return json({ error: "not found" }, 404);
    const bytes = Buffer.from(await source.arrayBuffer());
    if (detectImageMime(bytes) !== file.mime) return json({ error: "not found" }, 404);
    const preview = url.searchParams.has("preview");
    const body = preview ? await createImagePreview(bytes, file.mime) : bytes;
    await audit(userId, [conversation], "image", fileId);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": preview ? "image/webp" : file.mime,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  }

  let page;
  try {
    page = pagePublicMessages(database, conversation.id, before, MESSAGE_PAGE_SIZE);
  } catch (error) {
    if (error instanceof Error && error.message === "invalid cursor")
      return json({ error: "invalid cursor" }, 400);
    throw error;
  }
  const imageIds = [...new Set(page.messages.flatMap((message) => message.fileIds))];
  const images = imageIds.length
    ? database
        .select({
          id: files.id,
          name: files.name,
          mime: files.mime,
          size: files.size,
          source: files.source,
          created_at: files.created_at,
        })
        .from(files)
        .where(and(inArray(files.id, imageIds), inArray(files.mime, imageMimes)))
        .all()
    : [];
  const imageMap = new Map(images.map((image) => [image.id, image]));
  // Allowlist the public body and images, never tool payloads, reasoning or auth cards.
  const messages = page.messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content.includes("OpenAI Codexの再認証が必要です。")
      ? "認証情報は表示しません"
      : message.content,
    created_at: message.created_at,
    files: message.fileIds.flatMap((id) => {
      const image = imageMap.get(id);
      return image ? [image] : [];
    }),
  }));
  await audit(userId, [conversation], "conversation");
  return json({ messages, hasMore: page.hasMore });
}
