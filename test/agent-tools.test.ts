import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ToolResultMessage } from "@earendil-works/pi-ai";
import {
  appendAgentMessage,
  appendLegacyMessage,
  decodeStoredEntry,
  hydrateStoredEntry,
} from "../src/agent-messages";
import { createAgentTools } from "../src/agent-tools";

const directories: string[] = [];
const png = Buffer.from("89504e470d0a1a0a", "hex");

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "ai-chat-tools-"));
  directories.push(root);
  const db = new Database(":memory:");
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE conversations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id));
    CREATE TABLE skills (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL,
      instructions TEXT NOT NULL, enabled INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE files (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, path TEXT NOT NULL,
      mime TEXT NOT NULL, size INTEGER NOT NULL, source TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE runs (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id), user_entry_id TEXT NOT NULL,
      status TEXT NOT NULL, model TEXT NOT NULL, requested_thinking TEXT NOT NULL, resolved_thinking TEXT NOT NULL,
      turn_count INTEGER NOT NULL DEFAULT 0, context_tokens INTEGER NOT NULL DEFAULT 0, error TEXT,
      started_at TEXT, finished_at TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE conversation_entries (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id),
      run_id TEXT REFERENCES runs(id), sequence INTEGER NOT NULL, kind TEXT NOT NULL,
      payload_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(conversation_id,sequence)
    );
    INSERT INTO users(id) VALUES('user-1'),('user-2');
    INSERT INTO conversations(id,user_id) VALUES('conversation-1','user-1'),('conversation-2','user-1');
  `);
  appendLegacyMessage(db, {
    id: "user-entry",
    conversationId: "conversation-1",
    role: "user",
    content: "start",
    createdAt: "2025-01-01T00:00:00.000Z",
  });
  db.query(
    `INSERT INTO runs(id,conversation_id,user_entry_id,status,model,requested_thinking,resolved_thinking,created_at)
     VALUES('run','conversation-1','user-entry','running','fake','low','low','2025-01-01T00:00:00.000Z')`,
  ).run();
  const skillPath = join(root, "SKILL.md");
  await writeFile(skillPath, "# Image generation\nUse the image tool.");
  return { db, root, skillPath };
}

function tool(tools: ReturnType<typeof createAgentTools>, name: string) {
  return tools.find((item) => item.name === name)!;
}

describe("custom tool executor", () => {
  test("web_searchへAbortSignalを伝播し、budgetと結果上限を強制する", async () => {
    const { db } = await fixture();
    let calls = 0;
    const tools = createAgentTools(
      { userId: "user-1", conversationId: "conversation-1", runId: "run" },
      {
        database: db,
        webSearch: async (_query, _maxResults, signal) => {
          calls += 1;
          if (signal.aborted) throw new Error("aborted");
          return "x".repeat(40_000);
        },
      },
    );
    const search = tool(tools, "web_search");
    const controller = new AbortController();
    controller.abort();
    await expect(search.execute("aborted", { query: "abort" }, controller.signal)).rejects.toThrow(
      "aborted",
    );
    for (let index = 0; index < 3; index++)
      await search.execute(String(index), { query: "bounded" });
    await expect(search.execute("over", { query: "bounded" })).rejects.toThrow(
      "web_search budget reached",
    );
    expect(calls).toBe(4);
    const result = await createAgentTools(
      { userId: "user-1", conversationId: "conversation-1", runId: "run" },
      { database: db, webSearch: async () => "x".repeat(40_000) },
    )[0].execute("limited", { query: "bounded" });
    expect(result.content[0].type === "text" && result.content[0].text.length).toBeLessThanOrEqual(
      30_000,
    );
  });

  test("load_skillはenabledな所有skillだけを一度読み込む", async () => {
    const { db, skillPath } = await fixture();
    for (const [id, userId, name, enabled] of [
      ["owned", "user-1", "owned", 1],
      ["disabled", "user-1", "disabled", 0],
      ["foreign", "user-2", "foreign", 1],
    ] as const)
      db.query(
        `INSERT INTO skills(id,user_id,name,description,instructions,enabled,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?)`,
      ).run(
        id,
        userId,
        name,
        "description",
        `private instructions for ${name}`,
        enabled,
        "2025-01-01T00:00:00.000Z",
        "2025-01-01T00:00:00.000Z",
      );
    const load = tool(
      createAgentTools(
        { userId: "user-1", conversationId: "conversation-1", runId: "run" },
        { database: db, imagegenSkillPath: skillPath },
      ),
      "load_skill",
    );
    expect(JSON.stringify(await load.execute("owned", { name: "owned" }))).toContain(
      "private instructions for owned",
    );
    const duplicate = await load.execute("owned-again", { name: "owned" });
    expect(JSON.stringify(duplicate)).not.toContain("private instructions");
    await expect(load.execute("disabled", { name: "disabled" })).rejects.toThrow("not available");
    await expect(load.execute("foreign", { name: "foreign" })).rejects.toThrow("not available");
  });

  test("inspect_imageは所有権・conversation association・MIMEを検証する", async () => {
    const { db, root } = await fixture();
    const path = join(root, "image.png");
    await writeFile(path, png);
    db.query(
      "INSERT INTO files(id,user_id,name,path,mime,size,source,created_at) VALUES(?,?,?,?,?,?,?,?)",
    ).run(
      "other-conversation",
      "user-1",
      "image.png",
      path,
      "image/png",
      png.length,
      "upload",
      "2025-01-01T00:00:00.000Z",
    );
    appendLegacyMessage(db, {
      id: "other-entry",
      conversationId: "conversation-2",
      role: "user",
      content: "image",
      fileIds: ["other-conversation"],
      createdAt: "2025-01-01T00:00:00.000Z",
    });
    const inspect = tool(
      createAgentTools(
        { userId: "user-1", conversationId: "conversation-1", runId: "run" },
        { database: db },
      ),
      "inspect_image",
    );
    await expect(inspect.execute("inspect", { fileId: "other-conversation" })).rejects.toThrow(
      "not associated",
    );

    db.query(
      "INSERT INTO files(id,user_id,name,path,mime,size,source,created_at) VALUES(?,?,?,?,?,?,?,?)",
    ).run(
      "wrong-mime",
      "user-1",
      "image.jpg",
      path,
      "image/jpeg",
      png.length,
      "upload",
      "2025-01-01T00:00:00.000Z",
    );
    appendLegacyMessage(db, {
      id: "mime-entry",
      conversationId: "conversation-1",
      role: "user",
      content: "image",
      fileIds: ["wrong-mime"],
      createdAt: "2025-01-01T00:00:01.000Z",
    });
    await expect(inspect.execute("inspect", { fileId: "wrong-mime" })).rejects.toThrow(
      "MIME does not match",
    );
  });

  test("generate_imageはskill読込順に依存せず、imageRefとして保存する", async () => {
    const { db, root, skillPath } = await fixture();
    const tools = createAgentTools(
      { userId: "user-1", conversationId: "conversation-1", runId: "run" },
      {
        database: db,
        dataDir: root,
        imagegenSkillPath: skillPath,
        generateImage: async () => png,
        id: () => "generated-file",
        now: () => "2025-01-02T00:00:00.000Z",
      },
    );
    const generated = await tool(tools, "generate_image").execute("generate", {
      prompt: "a simple image",
    });
    expect(generated.details).toMatchObject({
      file: { id: "generated-file", source: "generated" },
      operation: "generation",
    });
    const generatedRow = db.query("SELECT path FROM files WHERE id='generated-file'").get() as {
      path: string;
    };
    const stablePath = join(root, "generated.png");
    await rename(generatedRow.path, stablePath);
    db.query("UPDATE files SET path=? WHERE id='generated-file'").run(stablePath);
    const message: ToolResultMessage = {
      role: "toolResult",
      toolCallId: "generate",
      toolName: "generate_image",
      content: generated.content,
      details: generated.details,
      isError: false,
      timestamp: Date.now(),
    };
    const entry = appendAgentMessage(db, "conversation-1", "run", message);
    const stored = decodeStoredEntry(entry);
    expect(JSON.stringify(stored)).not.toContain(png.toString("base64"));
    expect(stored).toMatchObject({
      content: [
        { type: "text", text: "Image generated." },
        { type: "imageRef", fileId: "generated-file", mimeType: "image/png" },
      ],
    });
    await expect(hydrateStoredEntry(db, entry, "user-1")).resolves.toMatchObject({
      role: "toolResult",
      content: [{ type: "text" }, { type: "image", mimeType: "image/png" }],
    });
    await expect(hydrateStoredEntry(db, entry, "user-2")).rejects.toThrow("ownership mismatch");
  });
});
