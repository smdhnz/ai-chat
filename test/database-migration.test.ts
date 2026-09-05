import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directories: string[] = [];
const root = join(import.meta.dir, "..");

function dataDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "ai-chat-migration-"));
  directories.push(directory);
  return directory;
}

function migrate(directory: string): void {
  execFileSync(process.execPath, ["-e", 'await import("./src/api/db.ts")'], {
    cwd: root,
    env: {
      ...process.env,
      DATA_DIR: directory,
      DISCORD_CLIENT_ID: "test",
      DISCORD_CLIENT_SECRET: "test",
      ALLOWED_DISCORD_USER_IDS: "user",
    },
    stdio: "pipe",
  });
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});

describe("database migration", () => {
  test("新規DBを現行schemaから一括作成する", () => {
    const directory = dataDirectory();
    migrate(directory);
    const sqlite = new Database(join(directory, "chat.sqlite"), { readonly: true });

    expect(
      sqlite
        .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all()
        .map((row) => (row as { name: string }).name),
    ).toEqual([
      "__drizzle_migrations",
      "conversation_entries",
      "conversation_reads",
      "conversations",
      "files",
      "oauth_states",
      "project_invitations",
      "project_members",
      "project_skills",
      "projects",
      "runs",
      "sessions",
      "skills",
      "users",
    ]);
    expect(sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  test("既存データを保ったままbaseline化し、旧schemaだけ削除する", () => {
    const directory = dataDirectory();
    migrate(directory);
    const path = join(directory, "chat.sqlite");
    const sqlite = new Database(path);
    sqlite.exec(`
      ALTER TABLE users DROP COLUMN default_system_prompt;
      ALTER TABLE users ADD COLUMN ctrl_enter_send INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN language TEXT NOT NULL DEFAULT 'Japanese';
      ALTER TABLE users ADD COLUMN thinking_level TEXT NOT NULL DEFAULT 'low';
      ALTER TABLE users ADD COLUMN model TEXT;
      ALTER TABLE projects ADD COLUMN language TEXT NOT NULL DEFAULT 'Japanese';
      DROP TABLE project_skills;
      ALTER TABLE skills DROP COLUMN source_id;
      ALTER TABLE skills DROP COLUMN files;
      ALTER TABLE projects ADD COLUMN thinking_level TEXT NOT NULL DEFAULT 'low';
      INSERT INTO users (
        id,username,display_name,avatar,created_at,updated_at,language,thinking_level,model,ctrl_enter_send
      ) VALUES ('user','name','User',NULL,'2025','2025','Japanese','low','old-model',1);
      INSERT INTO conversations VALUES ('conversation','user',NULL,'Chat','',NULL,0,0,'idle',0,'2025','2025');
      INSERT INTO conversation_entries VALUES ('message','conversation',NULL,0,'user_message','{}','2025');
      INSERT INTO skills (id,user_id,name,description,instructions,enabled,created_at,updated_at)
      VALUES ('skill','user','existing','description','instructions',1,'2025','2025');
      CREATE TABLE messages (id TEXT PRIMARY KEY);
      INSERT INTO messages VALUES ('message');
      DROP TABLE __drizzle_migrations;
    `);
    sqlite.close();

    migrate(directory);
    const migrated = new Database(path, { readonly: true });
    expect(migrated.query("SELECT id FROM users").all()).toEqual([{ id: "user" }]);
    expect(migrated.query("SELECT id, name FROM skills").all()).toEqual([
      { id: "skill", name: "existing" },
    ]);
    expect(
      migrated
        .query(
          "SELECT name FROM pragma_table_info('users') WHERE name IN ('language','thinking_level','model','ctrl_enter_send')",
        )
        .all(),
    ).toEqual([]);
    expect(
      migrated
        .query(
          "SELECT name FROM pragma_table_info('projects') WHERE name IN ('language','thinking_level')",
        )
        .all(),
    ).toEqual([]);
    expect(
      migrated.query("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'").get(),
    ).toBeNull();
    expect(migrated.query("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  test("未移行の旧messageがあれば削除せず停止する", () => {
    const directory = dataDirectory();
    migrate(directory);
    const path = join(directory, "chat.sqlite");
    const sqlite = new Database(path);
    sqlite.exec(`
      CREATE TABLE messages (id TEXT PRIMARY KEY);
      INSERT INTO messages VALUES ('unmigrated');
      DROP TABLE __drizzle_migrations;
    `);
    sqlite.close();

    expect(() => migrate(directory)).toThrow();
    const unchanged = new Database(path, { readonly: true });
    expect(unchanged.query("SELECT id FROM messages").all()).toEqual([{ id: "unmigrated" }]);
  });
});
