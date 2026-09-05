import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text().primaryKey(),
  username: text().notNull(),
  display_name: text().notNull(),
  avatar: text(),
  default_system_prompt: text().notNull().default(""),
  created_at: text().notNull(),
  updated_at: text().notNull(),
});

export const sessions = sqliteTable("sessions", {
  token_hash: text().primaryKey(),
  user_id: text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires_at: text().notNull(),
});

export const oauthStates = sqliteTable("oauth_states", {
  state: text().primaryKey(),
  expires_at: text().notNull(),
});

export const projects = sqliteTable("projects", {
  id: text().primaryKey(),
  user_id: text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text().notNull(),
  system_prompt: text().notNull().default(""),
  shared: integer().notNull().default(0),
  created_at: text().notNull(),
  updated_at: text().notNull(),
});

export const projectMembers = sqliteTable(
  "project_members",
  {
    project_id: text()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    user_id: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    created_at: text().notNull(),
  },
  (table) => [primaryKey({ columns: [table.project_id, table.user_id] })],
);

export const projectInvitations = sqliteTable(
  "project_invitations",
  {
    project_id: text()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    user_id: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    created_at: text().notNull(),
  },
  (table) => [primaryKey({ columns: [table.project_id, table.user_id] })],
);

export const conversations = sqliteTable(
  "conversations",
  {
    id: text().primaryKey(),
    user_id: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    project_id: text().references(() => projects.id, { onDelete: "cascade" }),
    title: text().notNull(),
    context_summary: text().notNull().default(""),
    compacted_through_id: text(),
    context_tokens: integer().notNull().default(0),
    temporary: integer().notNull().default(0),
    generation_status: text().notNull().default("idle"),
    unread: integer().notNull().default(0),
    created_at: text().notNull(),
    updated_at: text().notNull(),
  },
  (table) => [index("conversations_user_updated").on(table.user_id, table.updated_at)],
);

export const skills = sqliteTable(
  "skills",
  {
    id: text().primaryKey(),
    user_id: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text().notNull(),
    description: text().notNull().default(""),
    instructions: text().notNull(),
    files: text().notNull().default("[]"),
    source_id: text(),
    enabled: integer().notNull().default(1),
    created_at: text().notNull(),
    updated_at: text().notNull(),
  },
  (table) => [
    uniqueIndex("skills_user_name_unique").on(table.user_id, table.name),
    index("skills_user_updated").on(table.user_id, table.updated_at),
  ],
);

export const projectSkills = sqliteTable(
  "project_skills",
  {
    id: text().primaryKey(),
    project_id: text()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text().notNull(),
    description: text().notNull().default(""),
    instructions: text().notNull(),
    files: text().notNull().default("[]"),
    source_id: text().notNull(),
    enabled: integer().notNull().default(1),
    created_at: text().notNull(),
    updated_at: text().notNull(),
  },
  (table) => [
    uniqueIndex("project_skills_project_name_unique").on(table.project_id, table.name),
    index("project_skills_project_updated").on(table.project_id, table.updated_at),
  ],
);

export const files = sqliteTable(
  "files",
  {
    id: text().primaryKey(),
    user_id: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text().notNull(),
    path: text().notNull(),
    mime: text().notNull(),
    size: integer().notNull(),
    source: text().notNull(),
    created_at: text().notNull(),
  },
  (table) => [index("files_user_created").on(table.user_id, table.created_at)],
);

export const conversationReads = sqliteTable(
  "conversation_reads",
  {
    conversation_id: text()
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    user_id: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    unread: integer().notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.conversation_id, table.user_id] })],
);

export const runs = sqliteTable(
  "runs",
  {
    id: text().primaryKey(),
    conversation_id: text()
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    user_entry_id: text().notNull(),
    status: text().$type<"queued" | "running" | "completed" | "stopped" | "failed">().notNull(),
    model: text().notNull(),
    requested_thinking: text().notNull(),
    resolved_thinking: text().notNull(),
    turn_count: integer().notNull().default(0),
    context_tokens: integer().notNull().default(0),
    error: text(),
    started_at: text(),
    finished_at: text(),
    created_at: text().notNull(),
  },
  (table) => [
    check(
      "runs_status_check",
      sql`${table.status} in ('queued','running','completed','stopped','failed')`,
    ),
    index("runs_conversation_created").on(table.conversation_id, table.created_at),
  ],
);

export const conversationEntries = sqliteTable(
  "conversation_entries",
  {
    id: text().primaryKey(),
    conversation_id: text()
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    run_id: text().references(() => runs.id, { onDelete: "set null" }),
    sequence: integer().notNull(),
    kind: text()
      .$type<"user_message" | "assistant_message" | "tool_result" | "compaction" | "activity">()
      .notNull(),
    payload_json: text().notNull(),
    created_at: text().notNull(),
  },
  (table) => [
    check(
      "conversation_entries_kind_check",
      sql`${table.kind} in ('user_message','assistant_message','tool_result','compaction','activity')`,
    ),
    uniqueIndex("conversation_entries_conversation_sequence_unique").on(
      table.conversation_id,
      table.sequence,
    ),
    index("conversation_entries_conversation_sequence").on(table.conversation_id, table.sequence),
  ],
);

export const schema = {
  users,
  sessions,
  oauthStates,
  projects,
  projectMembers,
  projectInvitations,
  conversations,
  conversationReads,
  skills,
  projectSkills,
  files,
  runs,
  conversationEntries,
};
