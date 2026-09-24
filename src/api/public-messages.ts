import { eq, inArray } from "drizzle-orm";
import { pagePublicMessages } from "./agent-messages";
import type { Database } from "./database";
import { MESSAGE_PAGE_SIZE } from "./messages";
import { files, users } from "./schema";

export function publicMessagePage(
  database: Database,
  conversationId: string,
  creatorId: string,
  before: string | null,
) {
  const page = pagePublicMessages(database, conversationId, before, MESSAGE_PAGE_SIZE);
  return {
    messages: page.messages.map(({ fileIds, authorId, ...message }) => ({
      ...message,
      author:
        message.role === "user"
          ? (database
              .select({
                id: users.id,
                username: users.username,
                display_name: users.display_name,
                avatar: users.avatar,
              })
              .from(users)
              .where(eq(users.id, authorId ?? creatorId))
              .get() ?? null)
          : undefined,
      files: fileIds.length
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
            .where(inArray(files.id, fileIds))
            .all()
        : [],
    })),
    hasMore: page.hasMore,
  };
}
