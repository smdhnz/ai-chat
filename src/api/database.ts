import type { Database as SQLiteDatabase } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { schema } from "./schema";

export type Database = BunSQLiteDatabase<typeof schema> & { $client: SQLiteDatabase };

export function createDatabase(client: SQLiteDatabase): Database {
  const database = drizzle(client, { schema }) as Database;
  database.$client = client;
  return database;
}
