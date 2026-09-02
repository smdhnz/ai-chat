import { Database as SQLiteDatabase } from "bun:sqlite";
import { eq, getTableColumns, getTableName, inArray, lt, type Table } from "drizzle-orm";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config";
import { createDatabase } from "./database";
import { conversations, oauthStates, runs, schema, sessions } from "./schema";

mkdirSync(config.dataDir, { recursive: true });
const sqlite = new SQLiteDatabase(join(config.dataDir, "chat.sqlite"), { create: true });
sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

const existingTables = new Set(
  (
    sqlite
      .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]
  ).map(({ name }) => name),
);
const tables = Object.values(schema) as Table[];
const hasMigration =
  existingTables.has("__drizzle_migrations") &&
  sqlite.query("SELECT 1 FROM __drizzle_migrations LIMIT 1").get() !== null;
if (!hasMigration && tables.some((table) => existingTables.has(getTableName(table))))
  for (const table of tables) {
    const name = getTableName(table);
    const columns = new Set(
      (sqlite.query(`PRAGMA table_info(${name})`).all() as { name: string }[]).map(
        ({ name }) => name,
      ),
    );
    const missing = Object.keys(getTableColumns(table)).filter(
      (column) => !columns.has(column) && !(name === "users" && column === "default_system_prompt"),
    );
    if (missing.length) throw new Error(`database schema mismatch: ${name}.${missing.join(",")}`);
  }

export const db = createDatabase(sqlite);
migrate(db, { migrationsFolder: join(import.meta.dir, "../../drizzle") });

const userColumns = new Set(
  (sqlite.query("PRAGMA table_info(users)").all() as { name: string }[]).map(({ name }) => name),
);
if (userColumns.has("model")) sqlite.exec("ALTER TABLE users DROP COLUMN model");

db.update(runs)
  .set({ status: "failed", error: "server restarted", finished_at: new Date().toISOString() })
  .where(inArray(runs.status, ["queued", "running"]))
  .run();
db.update(conversations)
  .set({ generation_status: "stopped" })
  .where(eq(conversations.generation_status, "running"))
  .run();

export const now = () => new Date().toISOString();
export const id = () => crypto.randomUUID();

export function cleanupExpired(): void {
  const timestamp = now();
  db.delete(sessions).where(lt(sessions.expires_at, timestamp)).run();
  db.delete(oauthStates).where(lt(oauthStates.expires_at, timestamp)).run();
}
