import { and, eq, inArray, ne } from "drizzle-orm";
import type { Database } from "./database";
import { allConversationFileIds } from "./agent-messages";
import { conversationReads, conversations, files, projectMembers, projects } from "./schema";

export function projectAccess(database: Database, projectId: string, userId: string) {
  const project = database
    .select({ id: projects.id, owner_id: projects.user_id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();
  if (!project) return null;
  if (project.owner_id === userId) return { ...project, isOwner: true };
  const member = database
    .select({ user_id: projectMembers.user_id })
    .from(projectMembers)
    .where(and(eq(projectMembers.project_id, projectId), eq(projectMembers.user_id, userId)))
    .get();
  return member ? { ...project, isOwner: false } : null;
}

export function conversationAccess(database: Database, conversationId: string, userId: string) {
  const conversation = database
    .select({
      id: conversations.id,
      creator_id: conversations.user_id,
      project_id: conversations.project_id,
      generation_status: conversations.generation_status,
    })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .get();
  if (!conversation) return null;
  if (!conversation.project_id)
    return conversation.creator_id === userId ? { ...conversation, isOwner: true } : null;
  const access = projectAccess(database, conversation.project_id, userId);
  return access ? { ...conversation, isOwner: access.isOwner } : null;
}

export function projectUserIds(database: Database, projectId: string): string[] {
  const project = database
    .select({ user_id: projects.user_id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();
  if (!project) return [];
  return [
    project.user_id,
    ...database
      .select({ user_id: projectMembers.user_id })
      .from(projectMembers)
      .where(eq(projectMembers.project_id, projectId))
      .all()
      .map((member) => member.user_id),
  ];
}

export function conversationUserIds(database: Database, conversationId: string): string[] {
  const conversation = database
    .select({ user_id: conversations.user_id, project_id: conversations.project_id })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .get();
  if (!conversation) return [];
  return conversation.project_id
    ? projectUserIds(database, conversation.project_id)
    : [conversation.user_id];
}

export function setConversationRead(
  database: Database,
  conversationId: string,
  userId: string,
): void {
  database
    .insert(conversationReads)
    .values({ conversation_id: conversationId, user_id: userId, unread: 0 })
    .onConflictDoUpdate({
      target: [conversationReads.conversation_id, conversationReads.user_id],
      set: { unread: 0 },
    })
    .run();
}

export function markConversationUnread(
  database: Database,
  conversationId: string,
  exceptUserId?: string,
): void {
  const userIds = conversationUserIds(database, conversationId);
  if (!userIds.length) return;
  database
    .insert(conversationReads)
    .values(userIds.map((userId) => ({ conversation_id: conversationId, user_id: userId })))
    .onConflictDoNothing()
    .run();
  database
    .update(conversationReads)
    .set({ unread: 1 })
    .where(
      and(
        eq(conversationReads.conversation_id, conversationId),
        exceptUserId ? ne(conversationReads.user_id, exceptUserId) : undefined,
      ),
    )
    .run();
}

export function fileAccess(database: Database, fileId: string, userId: string): boolean {
  if (
    database
      .select({ id: files.id })
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.user_id, userId)))
      .get()
  )
    return true;
  const rows = database.select({ id: conversations.id }).from(conversations).all();
  return rows.some(
    (conversation) =>
      conversationAccess(database, conversation.id, userId) &&
      allConversationFileIds(database, conversation.id).includes(fileId),
  );
}

export function deleteReadRows(database: Database, conversationIds: string[]): void {
  if (conversationIds.length)
    database
      .delete(conversationReads)
      .where(inArray(conversationReads.conversation_id, conversationIds))
      .run();
}
