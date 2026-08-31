import { describe, expect, test } from "bun:test";
import { Database as SQLiteDatabase } from "bun:sqlite";
import { createDatabase, type Database } from "../src/api/database";
import type { AssistantMessage, Message, Usage } from "@earendil-works/pi-ai";
import {
  compactConversation,
  estimateActiveContext,
  findCompactionCut,
  hydrateActiveContext,
  serializeCompactionInput,
  shouldCompact,
} from "../src/api/context";
import type { ConversationEntry } from "../src/api/agent-messages";

const usage: Usage = {
  input: 80,
  output: 20,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 100,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function entry(
  sequence: number,
  kind: ConversationEntry["kind"],
  payload: Record<string, unknown>,
): ConversationEntry {
  return {
    id: `entry-${sequence}`,
    conversation_id: "conversation",
    run_id: null,
    sequence,
    kind,
    payload_json: JSON.stringify(payload),
    created_at: `2025-01-01T00:00:${String(sequence).padStart(2, "0")}.000Z`,
  };
}

function database() {
  const db = createDatabase(new SQLiteDatabase(":memory:"));
  db.$client.exec(`
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, context_summary TEXT NOT NULL DEFAULT '',
      compacted_through_id TEXT, context_tokens INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE files (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, path TEXT NOT NULL,
      mime TEXT NOT NULL, source TEXT NOT NULL
    );
    CREATE TABLE runs (id TEXT PRIMARY KEY);
    CREATE TABLE conversation_entries (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, run_id TEXT,
      sequence INTEGER NOT NULL, kind TEXT NOT NULL, payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL, UNIQUE(conversation_id,sequence)
    );
    INSERT INTO conversations(id,user_id) VALUES('conversation','user');
    INSERT INTO runs(id) VALUES('run');
  `);
  return db;
}

function insert(db: Database, row: ConversationEntry) {
  db.$client
    .query("INSERT INTO conversation_entries VALUES(?,?,?,?,?,?,?)")
    .run(
      row.id,
      row.conversation_id,
      row.run_id,
      row.sequence,
      row.kind,
      row.payload_json,
      row.created_at,
    );
}

function assistantPayload(content: AssistantMessage["content"]) {
  return {
    role: "assistant",
    content,
    api: "openai-responses",
    provider: "openai",
    model: "fake",
    usage,
    stopReason: "stop",
  };
}

const summaryUsage = { ...usage, totalTokens: 5 };

function seedToolConversation(db: Database) {
  insert(
    db,
    entry(1, "user_message", {
      role: "user",
      content: [{ type: "text", text: "old ".repeat(30) }],
    }),
  );
  insert(
    db,
    entry(
      2,
      "assistant_message",
      assistantPayload([
        { type: "toolCall", id: "call-1", name: "web_search", arguments: { query: "fact" } },
      ]),
    ),
  );
  insert(
    db,
    entry(3, "tool_result", {
      role: "toolResult",
      toolCallId: "call-1",
      toolName: "web_search",
      content: [{ type: "text", text: "RAW SEARCH RESULT SHOULD NOT BE SUMMARIZED VERBATIM" }],
      details: { sources: [{ url: "https://example.com/source" }] },
      isError: false,
    }),
  );
  insert(
    db,
    entry(4, "user_message", { role: "user", content: [{ type: "text", text: "latest request" }] }),
  );
}

describe("context compaction", () => {
  test("272k/16kでは255,616 tokens超だけをtriggerにする", () => {
    expect(shouldCompact(255_616, 272_000)).toBe(false);
    expect(shouldCompact(255_617, 272_000)).toBe(true);
    expect(shouldCompact(115_200, 272_000)).toBe(false);
  });

  test("最新usageへ末尾だけを加算してcontext tokensを概算する", () => {
    const messages: Message[] = [
      { role: "user", content: "old", timestamp: 1 },
      { ...assistantPayload([{ type: "text", text: "answer" }]), timestamp: 2 } as AssistantMessage,
      { role: "user", content: "12345678", timestamp: 3 },
    ];
    expect(estimateActiveContext({ systemPrompt: "ignored after usage", messages })).toBe(102);
  });

  test("tool call/resultを同じ側へ残しlatest user requestを保持する", () => {
    const entries = [
      entry(1, "user_message", {
        role: "user",
        content: [{ type: "text", text: "old ".repeat(30) }],
      }),
      entry(
        2,
        "assistant_message",
        assistantPayload([{ type: "toolCall", id: "call", name: "tool", arguments: {} }]),
      ),
      entry(3, "tool_result", {
        role: "toolResult",
        toolCallId: "call",
        toolName: "tool",
        content: [{ type: "text", text: "result" }],
        isError: false,
      }),
      entry(4, "user_message", { role: "user", content: [{ type: "text", text: "latest" }] }),
    ];
    expect(findCompactionCut(entries, 4)).toBe(2);
    expect(findCompactionCut(entries, 10_000)).toBeNull();
  });

  test("summary payloadはprevious summary・画像ID・source URLを残し、除外対象を含めない", () => {
    const db = database();
    db.$client
      .query("INSERT INTO files VALUES(?,?,?,?,?,?)")
      .run("image-1", "user", "photo.png", "secret/path.png", "image/png", "upload");
    const entries = [
      entry(1, "user_message", {
        role: "user",
        content: [
          { type: "text", text: "see image" },
          { type: "imageRef", fileId: "image-1", mimeType: "image/png" },
        ],
      }),
      entry(2, "assistant_message", {
        ...assistantPayload([
          {
            type: "thinking",
            thinking: "important conclusion",
            thinkingSignature: "SECRET_SIGNATURE",
          },
          {
            type: "toolCall",
            id: "skill",
            name: "load_skill",
            arguments: { name: "imagegen", instructions: "FULL SKILL INSTRUCTIONS" },
          },
        ]),
      }),
      entry(3, "tool_result", {
        role: "toolResult",
        toolCallId: "skill",
        toolName: "load_skill",
        content: [{ type: "text", text: "FULL SKILL INSTRUCTIONS" }],
        details: { name: "imagegen" },
        isError: false,
      }),
      entry(4, "tool_result", {
        role: "toolResult",
        toolCallId: "search",
        toolName: "web_search",
        content: [{ type: "text", text: "RAW WEB SEARCH RESULT" }],
        details: { sources: [{ url: "https://example.com/source" }] },
        isError: false,
      }),
    ];
    const payload = serializeCompactionInput(db, "PREVIOUS SUMMARY", entries);
    expect(payload).toContain("PREVIOUS SUMMARY");
    expect(payload).toContain("fileId=image-1 name=photo.png");
    expect(payload).toContain("https://example.com/source");
    expect(payload).toContain("important conclusion");
    for (const excluded of [
      "SECRET_SIGNATURE",
      "FULL SKILL INSTRUCTIONS",
      "RAW WEB SEARCH RESULT",
      "secret/path.png",
      "base64",
    ])
      expect(payload).not.toContain(excluded);
  });

  test("checkpoint保存後はhidden summary + recent tailで復元し、繰り返しsummaryを更新する", async () => {
    const db = database();
    seedToolConversation(db);
    const payloads: string[] = [];
    const summarize = async (payload: string) => {
      payloads.push(payload);
      return { summary: `summary-${payloads.length}`, usage: summaryUsage };
    };
    const first = await compactConversation({
      database: db,
      conversationId: "conversation",
      userId: "user",
      runId: "run",
      systemPrompt: "system",
      tools: [],
      contextWindow: 20,
      reserveTokens: 10,
      keepRecentTokens: 20,
      summarize,
    });
    expect(first.compacted).toBe(true);
    expect(first.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "toolResult",
      "user",
    ]);
    expect(String(first.messages[0].content)).toContain("summary-1");
    expect(first.messages.at(-1)).toMatchObject({
      role: "user",
      content: [{ type: "text", text: "latest request" }],
    });

    const nextSequence = 6;
    insert(
      db,
      entry(
        nextSequence,
        "assistant_message",
        assistantPayload([{ type: "text", text: "new answer ".repeat(20) }]),
      ),
    );
    insert(
      db,
      entry(nextSequence + 1, "user_message", {
        role: "user",
        content: [{ type: "text", text: "new latest" }],
      }),
    );
    await compactConversation({
      database: db,
      conversationId: "conversation",
      userId: "user",
      runId: "run",
      systemPrompt: "system",
      tools: [],
      contextWindow: 20,
      reserveTokens: 10,
      keepRecentTokens: 1,
      summarize,
      id: () => "checkpoint-2",
    });
    expect(payloads[1]).toContain("summary-1");
    const rebuilt = await hydrateActiveContext(db, "conversation", "user");
    expect(String(rebuilt.messages[0].content)).toContain("summary-2");
    expect(rebuilt.messages.at(-1)).toMatchObject({
      role: "user",
      content: [{ type: "text", text: "new latest" }],
    });
    expect(
      (
        db.$client.query("SELECT COUNT(*) AS count FROM conversation_entries").get() as {
          count: number;
        }
      ).count,
    ).toBe(8);
  });
});
