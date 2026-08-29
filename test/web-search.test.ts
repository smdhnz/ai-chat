import { describe, expect, test } from "bun:test";
import { parseWebSearchResponse } from "../src/web-search";

describe("parseWebSearchResponse", () => {
  test("Exa MCPのSSE結果から本文を取り出す", () => {
    const body = `event: message\ndata: ${JSON.stringify({
      result: { content: [{ type: "text", text: "検索結果\nURL: https://example.com" }] },
    })}\n\n`;
    expect(parseWebSearchResponse(body)).toBe("検索結果\nURL: https://example.com");
  });
});
