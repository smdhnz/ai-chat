import { describe, expect, test } from "bun:test";
import { Database as SQLiteDatabase } from "bun:sqlite";
import { createDatabase } from "../src/api/database";
import {
  conversationAccess,
  conversationUserIds,
  fileAccess,
  markConversationUnread,
  projectAccess,
  projectUserIds,
  setConversationRead,
} from "../src/api/access";

function fixture() {
  const db = createDatabase(new SQLiteDatabase(":memory:"));
  db.$client.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE projects (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id));
    CREATE TABLE project_members (
      project_id TEXT NOT NULL REFERENCES projects(id), user_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL, PRIMARY KEY(project_id,user_id)
    );
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), project_id TEXT,
      generation_status TEXT NOT NULL, temporary INTEGER NOT NULL
    );
    CREATE TABLE conversation_reads (
      conversation_id TEXT NOT NULL REFERENCES conversations(id), user_id TEXT NOT NULL REFERENCES users(id),
      unread INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(conversation_id,user_id)
    );
    CREATE TABLE files (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, path TEXT NOT NULL,
      mime TEXT NOT NULL, size INTEGER NOT NULL, source TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE conversation_entries (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id), run_id TEXT,
      sequence INTEGER NOT NULL, kind TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
    INSERT INTO users VALUES('owner'),('member'),('invited'),('other');
    INSERT INTO projects VALUES('project','owner');
    INSERT INTO project_members VALUES('project','member','2025-01-01');
    INSERT INTO conversations VALUES('shared','member','project','idle',0);
    INSERT INTO conversations VALUES('temporary','member','project','idle',1);
    INSERT INTO conversations VALUES('private','owner',NULL,'idle',0);
    INSERT INTO files VALUES('image','member','image.png','/tmp/image.png','image/png',1,'upload','2025-01-01');
    INSERT INTO conversation_entries VALUES(
      'entry','shared',NULL,1,'user_message',
      '{"role":"user","content":[{"type":"imageRef","fileId":"image","mimeType":"image/png"}]}',
      '2025-01-01'
    );
  `);
  return db;
}

describe("shared project access", () => {
  test("ownerと承認済みmemberだけがprojectとconversationへアクセスできる", () => {
    const db = fixture();
    expect(projectAccess(db, "project", "owner")?.isOwner).toBe(true);
    expect(projectAccess(db, "project", "member")?.isOwner).toBe(false);
    expect(projectAccess(db, "project", "invited")).toBeNull();
    expect(conversationAccess(db, "shared", "member")).not.toBeNull();
    expect(conversationAccess(db, "shared", "other")).toBeNull();
    expect(conversationAccess(db, "private", "member")).toBeNull();
    expect(projectUserIds(db, "project")).toEqual(["owner", "member"]);
  });

  test("プロジェクトの一時conversationは作成者だけがアクセス・受信できる", () => {
    const db = fixture();
    expect(conversationAccess(db, "temporary", "member")).not.toBeNull();
    expect(conversationAccess(db, "temporary", "owner")).toBeNull();
    expect(conversationUserIds(db, "temporary")).toEqual(["member"]);
  });

  test("未読をユーザー別に更新し、conversation画像をmember間で共有する", () => {
    const db = fixture();
    setConversationRead(db, "shared", "owner");
    setConversationRead(db, "shared", "member");
    markConversationUnread(db, "shared", "member");
    expect(
      db.$client.query("SELECT user_id,unread FROM conversation_reads ORDER BY user_id").all(),
    ).toEqual([
      { user_id: "member", unread: 0 },
      { user_id: "owner", unread: 1 },
    ]);
    expect(fileAccess(db, "image", "owner")).toBe(true);
    expect(fileAccess(db, "image", "member")).toBe(true);
    expect(fileAccess(db, "image", "other")).toBe(false);
  });
});
