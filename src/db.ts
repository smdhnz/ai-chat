import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { migrateCanonicalTranscript } from "./agent-messages";
import { config } from "./config";

mkdirSync(config.dataDir, { recursive: true });
export const db = new Database(join(config.dataDir, "chat.sqlite"), { create: true });
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
db.exec(`
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
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL, context_summary TEXT NOT NULL DEFAULT '', compacted_through_id TEXT,
  context_tokens INTEGER NOT NULL DEFAULT 0, temporary INTEGER NOT NULL DEFAULT 0,
  generation_status TEXT NOT NULL DEFAULT 'idle', unread INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', instructions TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
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
  model TEXT NOT NULL,
  requested_thinking TEXT NOT NULL,
  resolved_thinking TEXT NOT NULL,
  turn_count INTEGER NOT NULL DEFAULT 0,
  context_tokens INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conversation_entries (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
  sequence INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('user_message','assistant_message','tool_result','compaction','activity')),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
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
    (db.query(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
      (column) => column.name,
    ),
  );
const userColumns = columns("users");
if (!userColumns.has("language"))
  db.exec("ALTER TABLE users ADD COLUMN language TEXT NOT NULL DEFAULT 'Japanese'");
if (!userColumns.has("ctrl_enter_send"))
  db.exec("ALTER TABLE users ADD COLUMN ctrl_enter_send INTEGER NOT NULL DEFAULT 0");
if (!userColumns.has("thinking_level"))
  db.exec("ALTER TABLE users ADD COLUMN thinking_level TEXT NOT NULL DEFAULT 'low'");
const projectColumns = columns("projects");
if (projectColumns.has("icon")) db.exec("ALTER TABLE projects DROP COLUMN icon");
if (projectColumns.has("color")) db.exec("ALTER TABLE projects DROP COLUMN color");
const conversationColumns = columns("conversations");
if (!conversationColumns.has("context_summary"))
  db.exec("ALTER TABLE conversations ADD COLUMN context_summary TEXT NOT NULL DEFAULT ''");
if (!conversationColumns.has("compacted_through_id"))
  db.exec("ALTER TABLE conversations ADD COLUMN compacted_through_id TEXT");
if (!conversationColumns.has("context_tokens"))
  db.exec("ALTER TABLE conversations ADD COLUMN context_tokens INTEGER NOT NULL DEFAULT 0");
if (!conversationColumns.has("temporary"))
  db.exec("ALTER TABLE conversations ADD COLUMN temporary INTEGER NOT NULL DEFAULT 0");
if (!conversationColumns.has("generation_status"))
  db.exec("ALTER TABLE conversations ADD COLUMN generation_status TEXT NOT NULL DEFAULT 'idle'");
if (!conversationColumns.has("unread"))
  db.exec("ALTER TABLE conversations ADD COLUMN unread INTEGER NOT NULL DEFAULT 0");
db.query(
  "UPDATE runs SET status='failed',error='server restarted',finished_at=? WHERE status IN ('queued','running')",
).run(new Date().toISOString());
db.query(
  "UPDATE conversations SET generation_status='stopped' WHERE generation_status='running'",
).run();
const messageColumns = columns("messages");
if (!messageColumns.has("skills"))
  db.exec("ALTER TABLE messages ADD COLUMN skills TEXT NOT NULL DEFAULT '[]'");
if (!messageColumns.has("attachment_context"))
  db.exec("ALTER TABLE messages ADD COLUMN attachment_context TEXT NOT NULL DEFAULT ''");
migrateCanonicalTranscript(db, config.codexModel);

export const now = () => new Date().toISOString();
export const id = () => crypto.randomUUID();

export function cleanupExpired(): void {
  const timestamp = now();
  db.query("DELETE FROM sessions WHERE expires_at < ?").run(timestamp);
  db.query("DELETE FROM oauth_states WHERE expires_at < ?").run(timestamp);
}
