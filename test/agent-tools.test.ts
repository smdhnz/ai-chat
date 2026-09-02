import { afterEach, describe, expect, test } from "bun:test";
import { Database as SQLiteDatabase } from "bun:sqlite";
import { createDatabase } from "../src/api/database";
import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ToolResultMessage } from "@earendil-works/pi-ai";
import {
  appendAgentMessage,
  appendLegacyMessage,
  decodeStoredEntry,
  hydrateStoredEntry,
} from "../src/api/agent-messages";
import { createAgentTools } from "../src/api/agent-tools";

const directories: string[] = [];
const png = Buffer.from("89504e470d0a1a0a", "hex");

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "ai-chat-tools-"));
  directories.push(root);
  const db = createDatabase(new SQLiteDatabase(":memory:"));
  db.$client.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE conversations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id));
    CREATE TABLE skills (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '', instructions TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id,name)
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
  db.$client
    .query(
      `INSERT INTO runs(id,conversation_id,user_entry_id,status,model,requested_thinking,resolved_thinking,created_at)
     VALUES('run','conversation-1','user-entry','running','fake','low','low','2025-01-01T00:00:00.000Z')`,
    )
    .run();
  return { db, root };
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

  test("inspect_imageは所有権・conversation association・MIMEを検証する", async () => {
    const { db, root } = await fixture();
    const path = join(root, "image.png");
    await writeFile(path, png);
    db.$client
      .query(
        "INSERT INTO files(id,user_id,name,path,mime,size,source,created_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
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
    db.$client
      .query(
        "INSERT INTO files(id,user_id,name,path,mime,size,source,created_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
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
    db.$client
      .query(
        "INSERT INTO files(id,user_id,name,path,mime,size,source,created_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        "hidden-image",
        "user-1",
        "hidden.png",
        path,
        "image/png",
        png.length,
        "upload",
        "2025-01-01T00:00:02.000Z",
      );
    appendLegacyMessage(db, {
      id: "hidden-entry",
      conversationId: "conversation-1",
      role: "user",
      content: "old image",
      fileIds: ["hidden-image"],
      createdAt: "2025-01-01T00:00:02.000Z",
    });
    const activeInspect = tool(
      createAgentTools(
        { userId: "user-1", conversationId: "conversation-1", runId: "run" },
        { database: db },
      ),
      "inspect_image",
    );
    await expect(
      activeInspect.execute("visible", { fileId: "hidden-image" }),
    ).resolves.toMatchObject({
      content: [{ type: "text", text: "Image is already present in active context." }],
      details: { alreadyVisible: true },
    });
    db.$client
      .query("INSERT INTO conversation_entries VALUES(?,?,?,?,?,?,?)")
      .run(
        "checkpoint",
        "conversation-1",
        null,
        4,
        "compaction",
        JSON.stringify({ summary: "old images", firstKeptSequence: 5 }),
        "2025-01-01T00:00:03.000Z",
      );
    appendLegacyMessage(db, {
      id: "latest-entry",
      conversationId: "conversation-1",
      role: "user",
      content: "latest",
      createdAt: "2025-01-01T00:00:04.000Z",
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
    await expect(inspect.execute("inspect", { fileId: "wrong-mime" })).rejects.toThrow(
      "MIME does not match",
    );
    await expect(inspect.execute("inspect", { fileId: "hidden-image" })).resolves.toMatchObject({
      content: [{ type: "text" }, { type: "image", mimeType: "image/png" }],
    });
  });

  test("load_skillは本人の有効スキルだけをactive context内で再利用し、画像APIをgateする", async () => {
    const { db, root } = await fixture();
    db.$client.exec(`
      INSERT INTO skills VALUES('own','user-1','own-skill','', 'OWN SECRET',1,'2025','2025');
      INSERT INTO skills VALUES('disabled','user-1','disabled-skill','', 'DISABLED SECRET',0,'2025','2025');
      INSERT INTO skills VALUES('foreign','user-2','foreign-skill','', 'FOREIGN SECRET',1,'2025','2025');
    `);
    let imageCalls = 0;
    const tools = createAgentTools(
      { userId: "user-1", conversationId: "conversation-1", runId: "run" },
      {
        database: db,
        generateImage: async () => {
          imageCalls += 1;
          return png;
        },
      },
    );
    const load = tool(tools, "load_skill");
    await expect(
      tool(tools, "generate_image").execute("blocked", { prompt: "image" }),
    ).rejects.toThrow("Load the imagegen skill first");
    expect(imageCalls).toBe(0);
    await expect(load.execute("disabled", { name: "disabled-skill" })).rejects.toThrow(
      "not available",
    );
    await expect(load.execute("foreign", { name: "foreign-skill" })).rejects.toThrow(
      "not available",
    );
    const own = await load.execute("own", { name: "own-skill" });
    expect(own.content).toEqual([
      {
        type: "text",
        text: expect.stringContaining("OWN SECRET"),
      },
    ]);
    expect(await load.execute("own-again", { name: "own-skill" })).toMatchObject({
      details: { name: "own-skill", source: "user", alreadyLoaded: true },
    });
    const builtin = await load.execute("builtin", { name: "imagegen" });
    expect(builtin).toMatchObject({ details: { name: "imagegen", source: "builtin" } });
    appendAgentMessage(db, "conversation-1", "run", {
      role: "toolResult",
      toolCallId: "builtin",
      toolName: "load_skill",
      content: builtin.content,
      details: builtin.details,
      isError: false,
      timestamp: Date.now(),
    });
    const retainedTools = createAgentTools(
      { userId: "user-1", conversationId: "conversation-1", runId: "run" },
      {
        database: db,
        dataDir: root,
        generateImage: async () => png,
        id: () => "retained-generated",
      },
    );
    const retained = tool(retainedTools, "load_skill");
    await expect(retained.execute("retained", { name: "imagegen" })).resolves.toMatchObject({
      details: { name: "imagegen", source: "builtin", alreadyLoaded: true },
    });
    await expect(
      tool(retainedTools, "generate_image").execute("retained-generate", { prompt: "image" }),
    ).resolves.toMatchObject({ details: { file: { id: "retained-generated" } } });
    db.$client
      .query("INSERT INTO conversation_entries VALUES(?,?,?,?,?,?,?)")
      .run(
        "skill-checkpoint",
        "conversation-1",
        null,
        4,
        "compaction",
        JSON.stringify({ summary: "loaded imagegen", firstKeptSequence: 5 }),
        "2025-01-01T00:00:03.000Z",
      );
    appendLegacyMessage(db, {
      id: "after-compaction",
      conversationId: "conversation-1",
      role: "user",
      content: "generate again",
      createdAt: "2025-01-01T00:00:04.000Z",
    });
    await expect(load.execute("after-compaction", { name: "imagegen" })).resolves.not.toMatchObject(
      { details: { alreadyLoaded: true } },
    );

    for (let index = 0; index < 9; index++)
      db.$client
        .query("INSERT INTO skills VALUES(?,?,?,?,?,?,?,?)")
        .run(
          `limit-${index}`,
          "user-1",
          `limit-${index}`,
          "",
          "instructions",
          1,
          "2025",
          `2025-${index}`,
        );
    const limited = tool(
      createAgentTools(
        { userId: "user-1", conversationId: "conversation-1", runId: "run" },
        { database: db },
      ),
      "load_skill",
    );
    for (let index = 0; index < 8; index++)
      await limited.execute(`limit-${index}`, { name: `limit-${index}` });
    await expect(limited.execute("over", { name: "limit-8" })).rejects.toThrow(
      "Skill load budget reached",
    );
  });

  test("generate_imageはimageRefとして保存し、共有相手も復元できる", async () => {
    const { db, root } = await fixture();
    const tools = createAgentTools(
      { userId: "user-1", conversationId: "conversation-1", runId: "run" },
      {
        database: db,
        dataDir: root,
        generateImage: async () => png,
        id: () => "generated-file",
        now: () => "2025-01-02T00:00:00.000Z",
      },
    );
    await tool(tools, "load_skill").execute("load", { name: "imagegen" });
    const generated = await tool(tools, "generate_image").execute("generate", {
      prompt: "a simple image",
    });
    expect(generated.details).toMatchObject({
      file: { id: "generated-file", source: "generated" },
      operation: "generation",
    });
    const generatedRow = db.$client
      .query("SELECT path FROM files WHERE id='generated-file'")
      .get() as {
      path: string;
    };
    const stablePath = join(root, "generated.png");
    await rename(generatedRow.path, stablePath);
    db.$client.query("UPDATE files SET path=? WHERE id='generated-file'").run(stablePath);
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
    await expect(hydrateStoredEntry(db, entry, "user-2")).resolves.toMatchObject({
      role: "toolResult",
      content: [{ type: "text" }, { type: "image", mimeType: "image/png" }],
    });
  });
});
