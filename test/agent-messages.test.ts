import { describe, expect, test } from "bun:test";
import { Database as SQLiteDatabase } from "bun:sqlite";
import { createDatabase } from "../src/api/database";
import type { Message } from "@earendil-works/pi-ai";
import {
  allConversationFileIds,
  appendLegacyMessage,
  decodeStoredEntry,
  hydrateStoredEntry,
  listLegacyMessages,
  pagePublicMessages,
  rewindConversation,
  validateToolResultLinks,
} from "../src/api/agent-messages";

function database() {
  const db = createDatabase(new SQLiteDatabase(":memory:"));
  db.$client.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), context_summary TEXT NOT NULL DEFAULT '',
      compacted_through_id TEXT, context_tokens INTEGER NOT NULL DEFAULT 0,
      unread INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE TABLE files (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, path TEXT NOT NULL,
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
  `);
  db.$client.query("INSERT INTO users(id) VALUES('user-1'),('user-2')").run();
  db.$client
    .query(
      "INSERT INTO conversations(id,user_id,context_summary,compacted_through_id,created_at) VALUES(?,?,?,?,?)",
    )
    .run("conversation", "user-1", "以前の要約", "old-user", "2025-01-01T00:00:00.000Z");
  for (const [id, user, mime, source] of [
    ["upload", "user-1", "image/png", "upload"],
    ["generated", "user-1", "image/png", "generated"],
    ["generated-2", "user-1", "image/png", "generated"],
  ])
    db.$client
      .query(
        "INSERT INTO files(id,user_id,name,path,mime,size,source,created_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(id, user, `${id}.png`, `/tmp/${id}.png`, mime, 1, source, "2025-01-01T00:00:00.000Z");
  return db;
}

describe("public transcript projection", () => {
  test("同じrunのreasoning・tool・final textを1件へまとめてsecretを公開しない", () => {
    const db = database();
    db.$client
      .query(
        `INSERT INTO runs(id,conversation_id,user_entry_id,status,model,requested_thinking,resolved_thinking,created_at)
       VALUES('run','conversation','user','completed','fake','low','low','2025-01-02')`,
      )
      .run();
    const rows = [
      [
        "user",
        null,
        1,
        "user_message",
        { role: "user", content: [{ type: "text", text: "調べて" }] },
      ],
      [
        "assistant-tool",
        "run",
        2,
        "assistant_message",
        {
          role: "assistant",
          content: [
            {
              type: "thinking",
              thinking: "検索が必要",
              thinkingSignature: "SECRET_SIGNATURE",
            },
            { type: "text", text: "確認します。" },
            {
              type: "toolCall",
              id: "search",
              name: "web_search",
              arguments: { query: "current fact" },
            },
            {
              type: "toolCall",
              id: "image",
              name: "generate_image",
              arguments: { prompt: "SECRET_IMAGE_PROMPT" },
            },
          ],
          api: "openai-responses",
          provider: "openai",
          model: "fake",
          usage: {
            input: 1,
            output: 1,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 2,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: "toolUse",
        },
      ],
      [
        "search-result",
        "run",
        3,
        "tool_result",
        {
          role: "toolResult",
          toolCallId: "search",
          toolName: "web_search",
          content: [{ type: "text", text: "RAW PRIVATE RESULT" }],
          details: {
            query: "current fact",
            sources: [{ title: "Source", url: "https://example.com" }],
          },
          isError: false,
        },
      ],
      [
        "image-result",
        "run",
        4,
        "tool_result",
        {
          role: "toolResult",
          toolCallId: "image",
          toolName: "generate_image",
          content: [{ type: "imageRef", fileId: "generated", mimeType: "image/png" }],
          details: { operation: "generation" },
          isError: false,
        },
      ],
      [
        "assistant-final",
        "run",
        5,
        "assistant_message",
        {
          role: "assistant",
          content: [{ type: "text", text: "完了しました。" }],
          api: "openai-responses",
          provider: "openai",
          model: "fake",
          usage: {
            input: 2,
            output: 1,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 3,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: "stop",
        },
      ],
    ] as const;
    for (const [id, runId, sequence, kind, payload] of rows)
      db.$client
        .query("INSERT INTO conversation_entries VALUES(?,?,?,?,?,?,?)")
        .run(
          id,
          "conversation",
          runId,
          sequence,
          kind,
          JSON.stringify(payload),
          `2025-01-02T00:00:0${sequence}.000Z`,
        );

    const page = pagePublicMessages(db, "conversation", null, 50);
    expect(page.messages).toHaveLength(2);
    expect(page.messages[1]).toMatchObject({
      id: "assistant-tool",
      runId: "run",
      content: "確認します。\n\n完了しました。",
      fileIds: ["generated"],
      status: "completed",
      activities: [
        { type: "reasoning", text: "検索が必要" },
        {
          type: "web_search",
          query: "current fact",
          sources: [{ title: "Source", url: "https://example.com" }],
          status: "completed",
        },
        { type: "image_generation", operation: "generation", status: "completed" },
      ],
    });
    expect(JSON.stringify(page)).not.toContain("SECRET_SIGNATURE");
    expect(JSON.stringify(page)).not.toContain("SECRET_IMAGE_PROMPT");
    expect(JSON.stringify(page)).not.toContain("RAW PRIVATE RESULT");
  });

  test("failed runの未完了画像生成とsanitized中断理由を公開する", () => {
    const db = database();
    db.$client
      .query(
        `INSERT INTO runs(id,conversation_id,user_entry_id,status,model,requested_thinking,resolved_thinking,error,created_at)
       VALUES('failed-run','conversation','user','failed','fake','low','low',?,'2025-01-02')`,
      )
      .run("server restarted\nSECRET STACK TRACE");
    const rows = [
      [
        "user",
        null,
        1,
        "user_message",
        { role: "user", content: [{ type: "text", text: "画像を作って" }] },
      ],
      [
        "skill-call",
        "failed-run",
        2,
        "assistant_message",
        {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "skill",
              name: "load_skill",
              arguments: { name: "imagegen" },
            },
          ],
          api: "openai-responses",
          provider: "openai",
          model: "fake",
          usage: {
            input: 1,
            output: 1,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 2,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: "toolUse",
        },
      ],
      [
        "skill-result",
        "failed-run",
        3,
        "tool_result",
        {
          role: "toolResult",
          toolCallId: "skill",
          toolName: "load_skill",
          content: [{ type: "text", text: "SECRET SKILL CONTENT" }],
          details: { name: "imagegen" },
          isError: false,
        },
      ],
      [
        "image-call",
        "failed-run",
        4,
        "assistant_message",
        {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "image",
              name: "generate_image",
              arguments: { prompt: "SECRET RAW PROMPT" },
            },
          ],
          api: "openai-responses",
          provider: "openai",
          model: "fake",
          usage: {
            input: 1,
            output: 1,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 2,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: "toolUse",
        },
      ],
    ] as const;
    for (const [id, runId, sequence, kind, payload] of rows)
      db.$client
        .query("INSERT INTO conversation_entries VALUES(?,?,?,?,?,?,?)")
        .run(
          id,
          "conversation",
          runId,
          sequence,
          kind,
          JSON.stringify(payload),
          `2025-01-02T00:00:0${sequence}.000Z`,
        );

    const page = pagePublicMessages(db, "conversation", null, 50);
    expect(page.messages[1]).toMatchObject({
      id: "skill-call",
      runId: "failed-run",
      status: "failed",
      skills: [],
      activities: [
        { type: "image_generation", status: "error" },
        {
          type: "tool",
          name: "run",
          summary: "サーバー再起動で処理が中断されました",
          status: "error",
        },
      ],
    });
    expect(JSON.stringify(page)).not.toContain("SECRET");
  });
});

describe("conversation regeneration", () => {
  test("対象user entryまで巻き戻し、runとcompaction checkpointを整合させる", () => {
    const db = database();
    appendLegacyMessage(db, {
      id: "user-1",
      conversationId: "conversation",
      role: "user",
      content: "first",
      createdAt: "2025-01-01T00:00:01.000Z",
    });
    db.$client
      .query(
        `INSERT INTO runs(id,conversation_id,user_entry_id,status,model,requested_thinking,resolved_thinking,created_at)
       VALUES('run-1','conversation','user-1','completed','model','low','low','2025-01-01T00:00:01.000Z')`,
      )
      .run();
    appendLegacyMessage(db, {
      id: "assistant-1",
      conversationId: "conversation",
      role: "assistant",
      content: "first answer",
      fileIds: ["generated"],
      createdAt: "2025-01-01T00:00:02.000Z",
      runId: "run-1",
    });
    db.$client
      .query(
        `INSERT INTO conversation_entries(id,conversation_id,run_id,sequence,kind,payload_json,created_at)
       VALUES('checkpoint','conversation','run-1',3,'compaction',?,'2025-01-01T00:00:03.000Z')`,
      )
      .run(JSON.stringify({ summary: "retained summary", tokensBefore: 123 }));
    appendLegacyMessage(db, {
      id: "user-2",
      conversationId: "conversation",
      role: "user",
      content: "second",
      createdAt: "2025-01-01T00:00:04.000Z",
    });
    db.$client
      .query(
        `INSERT INTO runs(id,conversation_id,user_entry_id,status,model,requested_thinking,resolved_thinking,created_at)
       VALUES('run-2','conversation','user-2','completed','model','low','low','2025-01-01T00:00:04.000Z')`,
      )
      .run();
    appendLegacyMessage(db, {
      id: "assistant-2",
      conversationId: "conversation",
      role: "assistant",
      content: "second answer",
      fileIds: ["generated-2"],
      createdAt: "2025-01-01T00:00:05.000Z",
      runId: "run-2",
    });
    db.$client
      .query(
        "UPDATE conversations SET context_summary='newer',compacted_through_id='user-2',context_tokens=999,unread=1 WHERE id='conversation'",
      )
      .run();
    const filesBefore = allConversationFileIds(db, "conversation");

    rewindConversation(db, "conversation", "user-2", "user-2", "edited second");

    expect(
      db.$client.query("SELECT id FROM conversation_entries ORDER BY sequence").all() as {
        id: string;
      }[],
    ).toEqual([{ id: "user-1" }, { id: "assistant-1" }, { id: "checkpoint" }, { id: "user-2" }]);
    expect(db.$client.query("SELECT id FROM runs ORDER BY id").all()).toEqual([{ id: "run-1" }]);
    expect(listLegacyMessages(db, "conversation").at(-1)?.content).toBe("edited second");
    expect(
      decodeStoredEntry(
        db.$client
          .query("SELECT kind,payload_json FROM conversation_entries WHERE id='user-2'")
          .get() as { kind: "user_message"; payload_json: string },
      ),
    ).toMatchObject({ authorId: "user-2" });
    expect(
      db.$client
        .query(
          "SELECT context_summary,compacted_through_id,context_tokens,unread FROM conversations WHERE id='conversation'",
        )
        .get(),
    ).toEqual({
      context_summary: "retained summary",
      compacted_through_id: null,
      context_tokens: 123,
      unread: 0,
    });
    const retained = new Set(allConversationFileIds(db, "conversation"));
    expect(filesBefore.filter((fileId) => !retained.has(fileId))).toEqual(["generated-2"]);
  });
});

describe("StoredMessage codec", () => {
  test("不正JSON・kind/role不一致・assistant metadata欠落を拒否する", () => {
    expect(() => decodeStoredEntry({ kind: "user_message", payload_json: "{" })).toThrow(
      "transcript is corrupt",
    );
    expect(() =>
      decodeStoredEntry({
        kind: "assistant_message",
        payload_json: JSON.stringify({ role: "user", content: [] }),
      }),
    ).toThrow("kind/role mismatch");
    expect(() =>
      decodeStoredEntry({
        kind: "assistant_message",
        payload_json: JSON.stringify({ role: "assistant", content: [] }),
      }),
    ).toThrow("metadata is incomplete");
  });

  test("conversationに関連しない別ユーザーのimageRefを復元しない", async () => {
    const db = database();
    db.$client
      .query(
        "INSERT INTO files(id,user_id,name,path,mime,size,source,created_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        "foreign",
        "user-2",
        "foreign.png",
        "/tmp/foreign.png",
        "image/png",
        1,
        "upload",
        "2025-01-01T00:00:00.000Z",
      );
    await expect(
      hydrateStoredEntry(
        db,
        {
          id: "entry",
          conversation_id: "conversation",
          run_id: null,
          sequence: 0,
          kind: "user_message",
          payload_json: JSON.stringify({
            role: "user",
            content: [{ type: "imageRef", fileId: "foreign", mimeType: "image/png" }],
          }),
          created_at: "2025-01-01T00:00:00.000Z",
        },
        "user-1",
      ),
    ).rejects.toThrow("image mismatch");
  });

  test("同じユーザーでもconversationに関連しないimageRefをhydrateしない", async () => {
    const db = database();
    await expect(
      hydrateStoredEntry(
        db,
        {
          id: "unassociated-entry",
          conversation_id: "conversation",
          run_id: null,
          sequence: 0,
          kind: "user_message",
          payload_json: JSON.stringify({
            role: "user",
            content: [{ type: "imageRef", fileId: "upload", mimeType: "image/png" }],
          }),
          created_at: "2025-01-01T00:00:00.000Z",
        },
        "user-1",
      ),
    ).rejects.toThrow("image mismatch");
  });

  test("orphan tool resultを拒否する", () => {
    const messages: Message[] = [
      {
        role: "toolResult",
        toolCallId: "missing",
        toolName: "tool",
        content: [{ type: "text", text: "result" }],
        isError: false,
        timestamp: 0,
      },
    ];
    expect(() => validateToolResultLinks(messages)).toThrow("orphan tool result");
  });
});
