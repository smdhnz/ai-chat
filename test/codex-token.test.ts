import { describe, expect, test } from "bun:test";
import { getCodexAccountId } from "../src/api/codex-token";

const token = (payload: unknown) =>
  `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;

describe("getCodexAccountId", () => {
  test("Codex JWTからChatGPTアカウントIDを取得する", () => {
    expect(
      getCodexAccountId(
        token({ "https://api.openai.com/auth": { chatgpt_account_id: "acct_123" } }),
      ),
    ).toBe("acct_123");
  });

  test("不正または必要claimのないトークンを拒否する", () => {
    expect(() => getCodexAccountId("invalid")).toThrow("Invalid Codex access token");
    expect(() => getCodexAccountId(token({}))).toThrow("Codex account ID is missing");
  });
});
