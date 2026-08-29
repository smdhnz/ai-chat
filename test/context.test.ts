import { describe, expect, test } from "bun:test";
import { isContextLarge } from "../src/context";

describe("isContextLarge", () => {
  test("出力枠を除いたコンテキストの80%を超えるとcompact対象になる", () => {
    expect(isContextLarge(72_000, 100_000, 10_000)).toBe(false);
    expect(isContextLarge(72_001, 100_000, 10_000)).toBe(true);
  });
});
