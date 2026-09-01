import { Database as SQLiteDatabase } from "bun:sqlite";
import { eq, inArray, lt } from "drizzle-orm";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { migrateCanonicalTranscript } from "./agent-messages";
import { config } from "./config";
import { createDatabase } from "./database";
import { conversations, oauthStates, runs, sessions } from "./schema";

mkdirSync(config.dataDir, { recursive: true });
const sqlite = new SQLiteDatabase(join(config.dataDir, "chat.sqlite"), { create: true });
sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
sqlite.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, username TEXT NOT NULL, display_name TEXT NOT NULL,
  avatar TEXT, language TEXT NOT NULL DEFAULT 'Japanese', ctrl_enter_send INTEGER NOT NULL DEFAULT 0,
  thinking_level TEXT NOT NULL DEFAULT 'low',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, system_prompt TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'Japanese', thinking_level TEXT NOT NULL DEFAULT 'low',
  shared INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS project_members (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL, PRIMARY KEY(project_id, user_id)
);
CREATE TABLE IF NOT EXISTS project_invitations (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL, PRIMARY KEY(project_id, user_id)
);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL, context_summary TEXT NOT NULL DEFAULT '', compacted_through_id TEXT,
  context_tokens INTEGER NOT NULL DEFAULT 0, temporary INTEGER NOT NULL DEFAULT 0,
  generation_status TEXT NOT NULL DEFAULT 'idle', unread INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conversation_reads (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  unread INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(conversation_id, user_id)
);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, path TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
  source TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL,
  file_ids TEXT NOT NULL DEFAULT '[]', skills TEXT NOT NULL DEFAULT '[]',
  attachment_context TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_entry_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued','running','completed','stopped','failed')),
  model TEXT NOT NULL, requested_thinking TEXT NOT NULL, resolved_thinking TEXT NOT NULL,
  turn_count INTEGER NOT NULL DEFAULT 0, context_tokens INTEGER NOT NULL DEFAULT 0,
  error TEXT, started_at TEXT, finished_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conversation_entries (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
  sequence INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('user_message','assistant_message','tool_result','compaction','activity')),
  payload_json TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(conversation_id, sequence)
);
CREATE INDEX IF NOT EXISTS conversations_user_updated ON conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS messages_conversation_created ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS conversation_entries_conversation_sequence ON conversation_entries(conversation_id, sequence);
CREATE INDEX IF NOT EXISTS runs_conversation_created ON runs(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS files_user_created ON files(user_id, created_at DESC);
`);

const columns = (table: string) =>
  new Set(
    (sqlite.query(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
      (column) => column.name,
    ),
  );
const userColumns = columns("users");
if (!userColumns.has("language"))
  sqlite.exec("ALTER TABLE users ADD COLUMN language TEXT NOT NULL DEFAULT 'Japanese'");
if (!userColumns.has("ctrl_enter_send"))
  sqlite.exec("ALTER TABLE users ADD COLUMN ctrl_enter_send INTEGER NOT NULL DEFAULT 0");
if (!userColumns.has("thinking_level"))
  sqlite.exec("ALTER TABLE users ADD COLUMN thinking_level TEXT NOT NULL DEFAULT 'low'");
const projectColumns = columns("projects");
if (projectColumns.has("icon")) sqlite.exec("ALTER TABLE projects DROP COLUMN icon");
if (projectColumns.has("color")) sqlite.exec("ALTER TABLE projects DROP COLUMN color");
if (!projectColumns.has("language")) {
  sqlite.exec("ALTER TABLE projects ADD COLUMN language TEXT NOT NULL DEFAULT 'Japanese'");
  sqlite.exec(
    "UPDATE projects SET language = coalesce((SELECT language FROM users WHERE users.id = projects.user_id), 'Japanese')",
  );
}
if (!projectColumns.has("thinking_level")) {
  sqlite.exec("ALTER TABLE projects ADD COLUMN thinking_level TEXT NOT NULL DEFAULT 'low'");
  sqlite.exec(
    "UPDATE projects SET thinking_level = coalesce((SELECT thinking_level FROM users WHERE users.id = projects.user_id), 'low')",
  );
}
if (!projectColumns.has("shared"))
  sqlite.exec("ALTER TABLE projects ADD COLUMN shared INTEGER NOT NULL DEFAULT 0");
const conversationColumns = columns("conversations");
if (!conversationColumns.has("context_summary"))
  sqlite.exec("ALTER TABLE conversations ADD COLUMN context_summary TEXT NOT NULL DEFAULT ''");
if (!conversationColumns.has("compacted_through_id"))
  sqlite.exec("ALTER TABLE conversations ADD COLUMN compacted_through_id TEXT");
if (!conversationColumns.has("context_tokens"))
  sqlite.exec("ALTER TABLE conversations ADD COLUMN context_tokens INTEGER NOT NULL DEFAULT 0");
if (!conversationColumns.has("temporary"))
  sqlite.exec("ALTER TABLE conversations ADD COLUMN temporary INTEGER NOT NULL DEFAULT 0");
if (!conversationColumns.has("generation_status"))
  sqlite.exec(
    "ALTER TABLE conversations ADD COLUMN generation_status TEXT NOT NULL DEFAULT 'idle'",
  );
if (!conversationColumns.has("unread"))
  sqlite.exec("ALTER TABLE conversations ADD COLUMN unread INTEGER NOT NULL DEFAULT 0");
const messageColumns = columns("messages");
if (!messageColumns.has("skills"))
  sqlite.exec("ALTER TABLE messages ADD COLUMN skills TEXT NOT NULL DEFAULT '[]'");
if (!messageColumns.has("attachment_context"))
  sqlite.exec("ALTER TABLE messages ADD COLUMN attachment_context TEXT NOT NULL DEFAULT ''");
sqlite.exec(`
INSERT OR IGNORE INTO conversation_reads(conversation_id, user_id, unread)
SELECT id, user_id, unread FROM conversations;
DROP TABLE IF EXISTS skills;
`);

export const db = createDatabase(sqlite);
db.update(runs)
  .set({ status: "failed", error: "server restarted", finished_at: new Date().toISOString() })
  .where(inArray(runs.status, ["queued", "running"]))
  .run();
db.update(conversations)
  .set({ generation_status: "stopped" })
  .where(eq(conversations.generation_status, "running"))
  .run();
migrateCanonicalTranscript(db, config.codexModel);

export const now = () => new Date().toISOString();
export const id = () => crypto.randomUUID();

export function cleanupExpired(): void {
  const timestamp = now();
  db.delete(sessions).where(lt(sessions.expires_at, timestamp)).run();
  db.delete(oauthStates).where(lt(oauthStates.expires_at, timestamp)).run();
}
