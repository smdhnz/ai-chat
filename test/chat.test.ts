import { describe, expect, test } from "bun:test";
import {
  chatUrl,
  isChatEventEnvelope,
  reduceChatStreams,
  streamMessage,
  type ChatStreams,
} from "../src/app/(chat)/_libs/chat";
import type { ChatEvent, ChatEventEnvelope } from "../src/lib/api";

function envelope(seq: number, event: ChatEvent, runId = "run-1"): ChatEventEnvelope {
  return {
    version: 1,
    conversationId: "conversation",
    runId,
    seq,
    timestamp: "2025-01-01T00:00:00.000Z",
    event,
  };
}

function apply(state: ChatStreams, seq: number, event: ChatEvent, runId?: string) {
  return reduceChatStreams(state, { type: "event", envelope: envelope(seq, event, runId) });
}

test("新規チャットの状態をURLへ反映する", () => {
  expect(chatUrl("/", false)).toBe("/");
  expect(chatUrl("/", true)).toBe("/?temporary=1");
  expect(chatUrl("/", false, "project-1")).toBe("/?project=project-1");
});

describe("chat stream reducer", () => {
  test("deltaだけを順に適用し、duplicate/out-of-order seqを無視する", () => {
    let state: ChatStreams = {};
    state = apply(state, 1, { type: "run.status", status: "running" });
    state = apply(state, 2, { type: "assistant.text.delta", contentIndex: 0, delta: "A" });
    state = apply(state, 2, { type: "assistant.text.delta", contentIndex: 0, delta: "duplicate" });
    state = apply(state, 4, { type: "assistant.text.delta", contentIndex: 0, delta: "C" });
    state = apply(state, 3, { type: "assistant.text.delta", contentIndex: 0, delta: "B" });
    expect(state.conversation).toMatchObject({
      runId: "run-1",
      lastSeq: 4,
      status: "running",
      content: "AC",
    });
  });

  test("reasoningとtool activityをstream messageへ投影する", () => {
    let state: ChatStreams = {};
    state = apply(state, 1, {
      type: "assistant.reasoning.delta",
      contentIndex: 0,
      delta: "要約",
    });
    state = apply(state, 2, {
      type: "tool.start",
      id: "skill",
      name: "load_skill",
      args: { name: "imagegen" },
    });
    state = apply(state, 3, {
      type: "tool.end",
      id: "skill",
      name: "load_skill",
      isError: false,
      result: { name: "imagegen", source: "builtin" },
    });
    state = apply(state, 4, {
      type: "tool.start",
      id: "search",
      name: "web_search",
      args: { query: "current fact" },
    });
    state = apply(state, 5, {
      type: "tool.end",
      id: "search",
      name: "web_search",
      isError: false,
      result: {
        query: "current fact",
        sources: [{ title: "Source", url: "https://example.com" }],
      },
    });
    const message = streamMessage(state.conversation);
    expect(message.activities).toEqual([
      { type: "reasoning", text: "要約" },
      { type: "skill", name: "imagegen", status: "completed" },
      {
        type: "web_search",
        query: "current fact",
        sources: [{ title: "Source", url: "https://example.com" }],
        status: "completed",
      },
    ]);
  });

  test("新runで旧streamを置換し、clearで削除する", () => {
    let state = apply({}, 1, { type: "assistant.text.delta", contentIndex: 0, delta: "old" });
    state = apply(
      state,
      1,
      { type: "assistant.text.delta", contentIndex: 0, delta: "new" },
      "run-2",
    );
    expect(state.conversation).toMatchObject({ runId: "run-2", content: "new" });
    expect(reduceChatStreams(state, { type: "clear", conversationId: "conversation" })).toEqual({});
  });

  test("不正なWebSocket payloadを拒否する", () => {
    expect(isChatEventEnvelope(envelope(1, { type: "run.done" }))).toBe(true);
    expect(isChatEventEnvelope({ version: 1, event: { type: "run.done" } })).toBe(false);
    expect(isChatEventEnvelope({ ...envelope(1, { type: "run.done" }), seq: 0 })).toBe(false);
    expect(
      isChatEventEnvelope({
        ...envelope(1, { type: "assistant.text.delta", contentIndex: 0, delta: "x" }),
        event: { type: "assistant.text.delta", contentIndex: 0 },
      }),
    ).toBe(false);
  });
});
