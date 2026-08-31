import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import type { AgentTool, StreamFn } from "@earendil-works/pi-agent-core";
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Model,
  type Usage,
} from "@earendil-works/pi-ai";
import { ConversationRunner, publicReasoning, type ChatEventEnvelope } from "../src/agent";
import {
  appendLegacyMessage,
  decodeStoredEntry,
  hydrateConversationEntries,
} from "../src/agent-messages";
import { createAgentTools, type ToolContext } from "../src/agent-tools";
import type { SummarizeConversation } from "../src/context";

const usage: Usage = {
  input: 3,
  output: 2,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 5,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};
const model: Model<"openai-responses"> = {
  id: "fake",
  name: "Fake",
  api: "openai-responses",
  provider: "openai",
  baseUrl: "http://localhost",
  reasoning: true,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1_000,
  maxTokens: 100,
};

function database() {
  const db = new Database(":memory:");
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), generation_status TEXT NOT NULL,
      context_summary TEXT NOT NULL DEFAULT '', compacted_through_id TEXT,
      context_tokens INTEGER NOT NULL DEFAULT 0, unread INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE files (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, path TEXT NOT NULL, mime TEXT NOT NULL
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
    INSERT INTO users(id) VALUES('user');
    INSERT INTO conversations(id,user_id,generation_status,updated_at)
      VALUES('conversation','user','idle','2025-01-01T00:00:00.000Z');
  `);
  appendLegacyMessage(db, {
    id: "user-entry",
    conversationId: "conversation",
    role: "user",
    content: "start",
    createdAt: "2025-01-01T00:00:00.000Z",
  });
  return db;
}

function assistant(
  content: AssistantMessage["content"],
  stopReason: AssistantMessage["stopReason"],
  errorMessage?: string,
): AssistantMessage {
  return {
    role: "assistant",
    content,
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage,
    stopReason,
    errorMessage,
    timestamp: Date.now(),
  };
}

function completedStream(message: AssistantMessage) {
  const stream = createAssistantMessageEventStream();
  queueMicrotask(() => {
    stream.push({ type: "start", partial: message });
    if (message.stopReason === "error" || message.stopReason === "aborted")
      stream.push({ type: "error", reason: message.stopReason, error: message });
    else if (
      message.stopReason === "stop" ||
      message.stopReason === "length" ||
      message.stopReason === "toolUse" ||
      message.stopReason === "deferred"
    )
      stream.push({ type: "done", reason: message.stopReason, message });
  });
  return stream;
}

async function startAndWait(
  db: Database,
  streamFn: StreamFn,
  options: {
    timeoutMs?: number;
    maxProviderTurns?: number;
    tools?: (context: ToolContext) => AgentTool[];
    summarize?: SummarizeConversation;
    reserveTokens?: number;
    keepRecentTokens?: number;
  } = {},
) {
  const events: ChatEventEnvelope[] = [];
  const runner = new ConversationRunner({
    database: db,
    model,
    streamFn,
    timeoutMs: options.timeoutMs ?? 1_000,
    maxProviderTurns: options.maxProviderTurns,
    tools: options.tools,
    summarize: options.summarize,
    reserveTokens: options.reserveTokens,
    keepRecentTokens: options.keepRecentTokens,
    publish: (_userId, event) => events.push(event),
  });
  await runner.start({
    conversationId: "conversation",
    userId: "user",
    userEntryId: "user-entry",
    systemPrompt: "test",
    requestedThinking: "low",
    resolvedThinking: "low",
  });
  await runner.waitForIdle("conversation");
  return { runner, events };
}

function seedCompactableHistory(db: Database) {
  db.query("DELETE FROM conversation_entries").run();
  appendLegacyMessage(db, {
    id: "old-user",
    conversationId: "conversation",
    role: "user",
    content: "old context ".repeat(20),
    createdAt: "2025-01-01T00:00:00.000Z",
  });
  appendLegacyMessage(db, {
    id: "old-assistant",
    conversationId: "conversation",
    role: "assistant",
    content: "old answer",
    createdAt: "2025-01-01T00:00:01.000Z",
  });
  appendLegacyMessage(db, {
    id: "user-entry",
    conversationId: "conversation",
    role: "user",
    content: "latest request",
    createdAt: "2025-01-01T00:00:02.000Z",
  });
}

function run(db: Database) {
  return db.query("SELECT status,turn_count,context_tokens,error FROM runs").get() as {
    status: string;
    turn_count: number;
    context_tokens: number;
    error: string | null;
  };
}

describe("ConversationRunner integration", () => {
  test("Agentのtool loopを通してfinal transcriptとrun eventを永続化する", async () => {
    const db = database();
    let turn = 0;
    const streamFn: StreamFn = () =>
      completedStream(
        turn++ === 0
          ? assistant(
              [{ type: "toolCall", id: "missing-1", name: "missing", arguments: {} }],
              "toolUse",
            )
          : assistant([{ type: "text", text: "recovered" }], "stop"),
      );

    const { events } = await startAndWait(db, streamFn);

    expect(run(db)).toEqual({ status: "completed", turn_count: 2, context_tokens: 5, error: null });
    expect(db.query("SELECT requested_thinking,resolved_thinking FROM runs").get()).toEqual({
      requested_thinking: "low",
      resolved_thinking: "low",
    });
    const rows = db
      .query("SELECT kind,payload_json FROM conversation_entries ORDER BY sequence")
      .all() as { kind: string; payload_json: string }[];
    expect(rows.map((row) => row.kind)).toEqual([
      "user_message",
      "assistant_message",
      "tool_result",
      "assistant_message",
    ]);
    expect(decodeStoredEntry(rows[2] as never)).toMatchObject({
      role: "toolResult",
      toolName: "missing",
      isError: true,
    });
    expect(events.filter((event) => event.event.type === "turn.start")).toHaveLength(2);
    expect(events.at(-1)?.event).toEqual({ type: "run.done" });
  });

  test("custom web_searchのresultを保存し、同じrunでfinal answerまで継続する", async () => {
    const db = database();
    let turn = 0;
    const streamFn: StreamFn = () =>
      completedStream(
        turn++ === 0
          ? assistant(
              [
                {
                  type: "toolCall",
                  id: "search-1",
                  name: "web_search",
                  arguments: { query: "current fact", maxResults: 2 },
                },
              ],
              "toolUse",
            )
          : assistant([{ type: "text", text: "final from evidence" }], "stop"),
      );

    const { events } = await startAndWait(db, streamFn, {
      tools: (context) =>
        createAgentTools(context, {
          database: db,
          webSearch: async () => "Evidence https://example.com/private",
        }),
    });

    expect(run(db)).toMatchObject({ status: "completed", turn_count: 2 });
    const result = db
      .query("SELECT kind,payload_json FROM conversation_entries WHERE kind='tool_result'")
      .get() as { kind: "tool_result"; payload_json: string };
    expect(decodeStoredEntry(result)).toMatchObject({
      role: "toolResult",
      toolName: "web_search",
      isError: false,
      details: {
        query: "current fact",
        sources: [{ url: "https://example.com/private" }],
      },
    });
    const publicFinal = events.find(
      (event) => event.event.type === "message.final" && event.event.entry.role === "toolResult",
    );
    expect(publicFinal?.event).toMatchObject({ type: "message.final", entry: { content: "" } });
    expect(JSON.stringify(events)).not.toContain("untrusted evidence");
  });

  test("thinking signatureを保存・再生し、公開projectionから除外する", async () => {
    const db = database();
    const thinking = {
      type: "thinking" as const,
      thinking: "provider summary",
      thinkingSignature: "opaque-secret-signature",
      redacted: true,
    };
    const { events } = await startAndWait(db, () =>
      completedStream(assistant([thinking, { type: "text", text: "answer" }], "stop")),
    );
    const row = db
      .query("SELECT kind,payload_json FROM conversation_entries WHERE kind='assistant_message'")
      .get() as { kind: "assistant_message"; payload_json: string };
    expect(decodeStoredEntry(row)).toMatchObject({ content: [thinking, { type: "text" }] });
    expect(await hydrateConversationEntries(db, "conversation", "user")).toContainEqual(
      expect.objectContaining({ role: "assistant", content: expect.arrayContaining([thinking]) }),
    );
    expect(JSON.stringify(events)).not.toContain(thinking.thinkingSignature);
    expect(publicReasoning(thinking)).toBe("推論内容は非公開");
  });

  test("stop時にpartial assistantを保存してrunをstoppedへ収束させる", async () => {
    const db = database();
    let started!: () => void;
    const ready = new Promise<void>((resolve) => (started = resolve));
    const streamFn: StreamFn = (_model, _context, options) => {
      const stream = createAssistantMessageEventStream();
      const partial = assistant([{ type: "text", text: "途中" }], "pending");
      queueMicrotask(() => {
        stream.push({ type: "start", partial });
        stream.push({ type: "text_delta", contentIndex: 0, delta: "途中", partial });
        started();
      });
      options?.signal?.addEventListener(
        "abort",
        () => {
          const aborted = assistant([{ type: "text", text: "途中" }], "aborted", "aborted");
          stream.push({ type: "error", reason: "aborted", error: aborted });
        },
        { once: true },
      );
      return stream;
    };
    const runner = new ConversationRunner({ database: db, model, streamFn, timeoutMs: 1_000 });
    await runner.start({
      conversationId: "conversation",
      userId: "user",
      userEntryId: "user-entry",
      systemPrompt: "test",
      requestedThinking: "low",
      resolvedThinking: "low",
    });
    await ready;

    expect(await runner.stop("conversation", "user")).toBe(true);

    expect(run(db).status).toBe("stopped");
    const saved = db
      .query("SELECT kind,payload_json FROM conversation_entries WHERE kind='assistant_message'")
      .get() as { kind: "assistant_message"; payload_json: string };
    expect(decodeStoredEntry(saved)).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "途中" }],
      stopReason: "aborted",
    });
  });

  test("自動compaction失敗時は元contextが送信可能なら継続する", async () => {
    const db = database();
    seedCompactableHistory(db);
    let calls = 0;
    await startAndWait(
      db,
      () => {
        calls += 1;
        return completedStream(assistant([{ type: "text", text: "fallback answer" }], "stop"));
      },
      {
        reserveTokens: 999,
        keepRecentTokens: 1,
        summarize: async () => {
          throw new Error("summary unavailable");
        },
      },
    );
    expect(calls).toBe(1);
    expect(run(db)).toMatchObject({ status: "completed" });
    expect(
      (
        db
          .query("SELECT COUNT(*) AS count FROM conversation_entries WHERE kind='compaction'")
          .get() as {
          count: number;
        }
      ).count,
    ).toBe(0);
  });

  test("context overflowは1回だけcompactしてretryし、失敗時はrunをfailedにする", async () => {
    const recoveredDb = database();
    seedCompactableHistory(recoveredDb);
    let turn = 0;
    await startAndWait(
      recoveredDb,
      () =>
        completedStream(
          turn++ === 0
            ? assistant([], "error", "Your input exceeds the context window of this model")
            : assistant([{ type: "text", text: "recovered after compaction" }], "stop"),
        ),
      {
        reserveTokens: 100,
        keepRecentTokens: 1,
        summarize: async () => ({ summary: "## User goal\nContinue latest request", usage }),
      },
    );
    expect(run(recoveredDb)).toMatchObject({ status: "completed", turn_count: 1 });
    expect(turn).toBe(2);
    expect(
      (
        recoveredDb
          .query("SELECT COUNT(*) AS count FROM conversation_entries WHERE kind='compaction'")
          .get() as { count: number }
      ).count,
    ).toBe(1);
    expect(
      JSON.stringify(recoveredDb.query("SELECT payload_json FROM conversation_entries").all()),
    ).not.toContain("exceeds the context window");

    const failedDb = database();
    seedCompactableHistory(failedDb);
    await startAndWait(
      failedDb,
      () => completedStream(assistant([], "error", "Your input exceeds the context window")),
      {
        reserveTokens: 100,
        keepRecentTokens: 1,
        summarize: async () => {
          throw new Error("summary failed");
        },
      },
    );
    expect(run(failedDb)).toMatchObject({
      status: "failed",
      turn_count: 1,
      error: "context overflow recovery failed: summary failed",
    });
  });

  test("compaction checkpoint保存失敗は元contextへfallbackせずrunをfailedにする", async () => {
    const db = database();
    seedCompactableHistory(db);
    db.exec(`CREATE TRIGGER fail_compaction BEFORE INSERT ON conversation_entries
      WHEN NEW.kind='compaction' BEGIN SELECT RAISE(FAIL,'checkpoint blocked'); END;`);
    const runner = new ConversationRunner({
      database: db,
      model,
      streamFn: () => completedStream(assistant([{ type: "text", text: "unused" }], "stop")),
      timeoutMs: 1_000,
      reserveTokens: 999,
      keepRecentTokens: 1,
      summarize: async () => ({ summary: "summary", usage }),
    });
    await expect(
      runner.start({
        conversationId: "conversation",
        userId: "user",
        userEntryId: "user-entry",
        systemPrompt: "test",
        requestedThinking: "low",
        resolvedThinking: "low",
      }),
    ).rejects.toThrow("checkpoint persistence failed");
    expect(run(db)).toMatchObject({ status: "failed" });
  });

  test("provider turn上限とwall timeoutをrun状態へ反映する", async () => {
    const limitedDb = database();
    let turn = 0;
    await startAndWait(
      limitedDb,
      () =>
        completedStream(
          assistant(
            [{ type: "toolCall", id: `missing-${turn++}`, name: "missing", arguments: {} }],
            "toolUse",
          ),
        ),
      { maxProviderTurns: 2 },
    );
    expect(run(limitedDb)).toMatchObject({ status: "completed", turn_count: 2 });

    const timeoutDb = database();
    const streamFn: StreamFn = (_model, _context, options) => {
      const stream = createAssistantMessageEventStream();
      const partial = assistant([{ type: "text", text: "partial" }], "pending");
      queueMicrotask(() => stream.push({ type: "start", partial }));
      options?.signal?.addEventListener(
        "abort",
        () => {
          const aborted = assistant([{ type: "text", text: "partial" }], "aborted", "timeout");
          stream.push({ type: "error", reason: "aborted", error: aborted });
        },
        { once: true },
      );
      return stream;
    };
    await startAndWait(timeoutDb, streamFn, { timeoutMs: 20 });
    expect(run(timeoutDb)).toMatchObject({
      status: "failed",
      turn_count: 1,
      error: "AI request timed out",
    });
  });
});
