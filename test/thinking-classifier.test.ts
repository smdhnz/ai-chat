import { describe, expect, test } from "bun:test";
import { parseThinkingClassification } from "../src/api/thinking-classifier";

describe("parseThinkingClassification", () => {
  test("thinkingと初回titleだけを受け入れる", () => {
    expect(parseThinkingClassification({ thinking: "high", title: "  短い題名  " }, true)).toEqual({
      thinking: "high",
      title: "短い題名",
    });
    expect(parseThinkingClassification({ thinking: "low", title: "不要" }, false).title).toBe("");
    expect(parseThinkingClassification({ thinking: "medium" }, true)).toEqual({
      thinking: "medium",
      title: "",
    });
    expect(() => parseThinkingClassification({ thinking: "max", title: "不正" }, true)).toThrow(
      "invalid thinking classification",
    );
  });
});
