import { describe, expect, test } from "bun:test";
import {
  ASSISTANT_CONTINUE_MARKER,
  lastUserIndex,
  parseAssistantReply,
  regenerationIndex,
} from "../src/messages";

describe("parseAssistantReply", () => {
  test("通常の返答は1メッセージで終了する", () => {
    expect(parseAssistantReply("  回答です。  ")).toEqual({
      content: "回答です。",
      continueGeneration: false,
    });
  });

  test("末尾の専用マーカーだけを継続要求として除去する", () => {
    expect(parseAssistantReply(`途中結果です。\n${ASSISTANT_CONTINUE_MARKER}`)).toEqual({
      content: "途中結果です。",
      continueGeneration: true,
    });
    expect(parseAssistantReply(`文中の ${ASSISTANT_CONTINUE_MARKER} はそのまま`)).toEqual({
      content: `文中の ${ASSISTANT_CONTINUE_MARKER} はそのまま`,
      continueGeneration: false,
    });
  });
});

describe("lastUserIndex", () => {
  test("応答済みと停止済みのどちらも最後の送信を再生成対象にする", () => {
    expect(lastUserIndex([{ role: "user" }, { role: "assistant" }])).toBe(0);
    expect(lastUserIndex([{ role: "assistant" }, { role: "user" }])).toBe(1);
  });

  test("指定したユーザーメッセージから分岐する", () => {
    const messages = [
      { id: "user-1", role: "user" },
      { id: "assistant-1", role: "assistant" },
      { id: "user-2", role: "user" },
    ];
    expect(regenerationIndex(messages, "user-1")).toBe(0);
    expect(regenerationIndex(messages, "assistant-1")).toBe(-1);
  });
});
