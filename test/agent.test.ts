import { describe, expect, test } from "bun:test";
import { Agent, type AgentTool, type StreamFn } from "@earendil-works/pi-agent-core";
import {
  createAssistantMessageEventStream,
  Type,
  type AssistantMessage,
  type Model,
  type Usage,
} from "@earendil-works/pi-ai";

const usage: Usage = {
  input: 1,
  output: 1,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 2,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};
const model: Model<"openai-responses"> = {
  id: "fake",
  name: "Fake",
  api: "openai-responses",
  provider: "openai",
  baseUrl: "http://localhost",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1_000,
  maxTokens: 100,
};

function response(content: AssistantMessage["content"], stopReason: "toolUse" | "stop") {
  return {
    role: "assistant",
    content,
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage,
    stopReason,
    timestamp: Date.now(),
  } satisfies AssistantMessage;
}

describe("Agent smoke", () => {
  test("tool callからresultを経てfinal textまで継続する", async () => {
    let turn = 0;
    const streamFn: StreamFn = () => {
      const stream = createAssistantMessageEventStream();
      const message =
        turn++ === 0
          ? response(
              [{ type: "toolCall", id: "call-1", name: "echo", arguments: { text: "hello" } }],
              "toolUse",
            )
          : response([{ type: "text", text: "done" }], "stop");
      queueMicrotask(() => {
        stream.push({ type: "start", partial: message });
        stream.push({ type: "done", reason: message.stopReason, message });
      });
      return stream;
    };
    const parameters = Type.Object({ text: Type.String() });
    const tool: AgentTool<typeof parameters> = {
      name: "echo",
      label: "Echo",
      description: "Echo text",
      parameters,
      execute: async (_toolCallId, params) => ({
        content: [{ type: "text", text: String(params.text) }],
        details: {},
      }),
    };
    const agent = new Agent({
      streamFn,
      initialState: {
        systemPrompt: "test",
        model,
        thinkingLevel: "off",
        tools: [tool],
        messages: [{ role: "user", content: "start", timestamp: Date.now() }],
      },
    });

    await agent.continue();

    expect(agent.state.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "toolResult",
      "assistant",
    ]);
    expect((agent.state.messages.at(-1) as AssistantMessage).content).toEqual([
      { type: "text", text: "done" },
    ]);
  });
});
