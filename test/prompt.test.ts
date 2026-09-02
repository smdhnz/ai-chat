import { describe, expect, test } from "bun:test";
import { Database as SQLiteDatabase } from "bun:sqlite";
import { createDatabase } from "../src/api/database";
import { BASE_SYSTEM_PROMPT, buildSystemPrompt } from "../src/api/prompt";

function fixture() {
  const db = createDatabase(new SQLiteDatabase(":memory:"));
  db.$client.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, system_prompt TEXT NOT NULL);
    CREATE TABLE conversations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, project_id TEXT);
    CREATE TABLE skills (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL,
      instructions TEXT NOT NULL, enabled INTEGER NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE files (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, path TEXT NOT NULL,
      mime TEXT NOT NULL, size INTEGER NOT NULL, source TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE conversation_entries (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, run_id TEXT, sequence INTEGER NOT NULL,
      kind TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
    INSERT INTO projects VALUES('project-1','user-1','OWNER PROJECT INSTRUCTION');
    INSERT INTO projects VALUES('project-2','user-2','FOREIGN PROJECT INSTRUCTION');
    INSERT INTO conversations VALUES('conversation-1','user-1','project-1');
    INSERT INTO conversations VALUES('conversation-2','user-2','project-2');
    INSERT INTO skills VALUES('own','user-1','own<skill','Own & useful','SECRET OWN INSTRUCTIONS',1,'2025-02');
    INSERT INTO skills VALUES('disabled','user-1','disabled','Hidden','SECRET DISABLED',0,'2025-03');
    INSERT INTO skills VALUES('foreign','user-2','foreign','Foreign','SECRET FOREIGN',1,'2025-04');
  `);
  const refs = [];
  for (let index = 0; index < 21; index++) {
    const id = `image-${index}`;
    refs.push({ type: "imageRef", fileId: id, mimeType: "image/png" });
    db.$client
      .query("INSERT INTO files VALUES(?,?,?,?,?,?,?,?)")
      .run(
        id,
        "user-1",
        `${id}.png`,
        `/secret/${id}.png`,
        "image/png",
        1,
        "upload",
        `2025-01-${String(index + 1).padStart(2, "0")}`,
      );
  }
  refs.push({ type: "imageRef", fileId: "foreign-image", mimeType: "image/png" });
  db.$client
    .query("INSERT INTO files VALUES(?,?,?,?,?,?,?,?)")
    .run(
      "foreign-image",
      "user-2",
      "foreign.png",
      "/secret/foreign.png",
      "image/png",
      1,
      "upload",
      "2025-01-31",
    );
  db.$client
    .query("INSERT INTO conversation_entries VALUES(?,?,?,?,?,?,?)")
    .run(
      "entry",
      "conversation-1",
      null,
      1,
      "user_message",
      JSON.stringify({ role: "user", content: refs }),
      "2025-01-31",
    );
  return db;
}

describe("system prompt assembly", () => {
  test("設計順・共有画像・manifest上限を守りsecret本文を混ぜない", () => {
    const prompt = buildSystemPrompt(
      fixture(),
      "conversation-1",
      "user-1",
      new Date("2026-08-31T12:00:00Z"),
    );
    expect(prompt.startsWith(BASE_SYSTEM_PROMPT)).toBe(true);
    const slots = [
      "# Runtime context",
      "<project_instructions>",
      "<available_skills>",
      "<conversation_images>",
    ].map((slot) => prompt.indexOf(slot));
    expect(slots).toEqual([...slots].sort((a, b) => a - b));
    expect(prompt).toContain("Current date: 2026-08-31");
    expect(prompt).toContain("OWNER PROJECT INSTRUCTION");
    expect(prompt).toContain("<name>imagegen</name>");
    expect(prompt).toContain("<name>own&lt;skill</name>");
    expect(prompt).toContain("<description>Own &amp; useful</description>");
    expect(prompt).not.toContain("<name>disabled</name>");
    expect(prompt).not.toContain("<name>foreign</name>");
    expect(prompt.match(/<image id=/g)).toHaveLength(20);
    for (const secret of [
      "/secret/",
      "SECRET OWN INSTRUCTIONS",
      "SECRET DISABLED",
      "SECRET FOREIGN",
      "conversation_summary",
      "web search result",
    ])
      expect(prompt).not.toContain(secret);
  });

  test("回答言語をJapaneseに固定する", () => {
    expect(buildSystemPrompt(fixture(), "conversation-1", "user-1")).toContain(
      "Preferred response language: Japanese",
    );
  });

  test("認可済みの共有conversationでは作成者に依存せずpromptを構築する", () => {
    expect(buildSystemPrompt(fixture(), "conversation-2", "user-1")).toContain(
      "FOREIGN PROJECT INSTRUCTION",
    );
  });
});
