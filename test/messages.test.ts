import { describe, expect, test } from "bun:test";
import { regenerationIndex } from "../src/api/messages";

describe("regenerationIndex", () => {
  test("未指定時は最後のuser messageを再生成対象にする", () => {
    expect(
      regenerationIndex([
        { id: "user", role: "user" },
        { id: "answer", role: "assistant" },
      ]),
    ).toBe(0);
    expect(
      regenerationIndex([
        { id: "answer", role: "assistant" },
        { id: "user", role: "user" },
      ]),
    ).toBe(1);
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
