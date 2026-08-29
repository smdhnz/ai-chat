import { describe, expect, test } from "bun:test";
import { parseDeviceAuth, readJson } from "../src/client/api";

describe("readJson", () => {
  test("HTML応答をJSON構文エラーではなくHTTPエラーとして扱う", async () => {
    const response = new Response("<!doctype html>", { status: 504 });
    expect(readJson(response)).rejects.toThrow("サーバーがJSONではない応答を返しました (HTTP 504)");
  });
});

describe("parseDeviceAuth", () => {
  test("再認証メッセージから安全なリンクとコードを取り出す", () => {
    expect(
      parseDeviceAuth(
        "OpenAI Codexの再認証が必要です。\n\n[認証ページを開く](https://example.com/device)\n\nコード: `ABCD-EFGH`",
      ),
    ).toEqual({
      verificationUri: "https://example.com/device",
      userCode: "ABCD-EFGH",
      expiresInSeconds: 0,
    });
    expect(
      parseDeviceAuth(
        "OpenAI Codexの再認証が必要です。\n\n[認証ページを開く](javascript:alert(1))\n\nコード: `bad`",
      ),
    ).toBeUndefined();
  });
});
