import { describe, expect, test } from "bun:test";
import {
  cacheSessionId,
  DEFAULT_THINKING_LEVEL,
  isAuthenticationError,
  needsCompaction,
  resolveAiSettings,
  TURN_PLAN_MODEL,
} from "../src/ai";
import { config } from "../src/config";

describe("Codex設定", () => {
  test("設定モデルとターンプランモデルを解決できる", () => {
    expect(resolveAiSettings("low").model).toBe(config.codexModel);
    expect(needsCompaction(0, TURN_PLAN_MODEL)).toBe(false);
  });

  test("未設定providerを認証エラーとして扱う", () => {
    expect(isAuthenticationError(new Error("Provider is not configured: openai-codex"))).toBe(true);
  });

  test("環境変数のモデルと不正なThinkingのデフォルトを解決する", () => {
    expect(resolveAiSettings("max")).toEqual({
      model: config.codexModel,
      thinking: DEFAULT_THINKING_LEVEL,
    });
  });

  test("会話・用途・モデル単位でキャッシュセッションを分離する", () => {
    const chat = cacheSessionId("conversation", config.codexModel);
    expect(chat).toBe(cacheSessionId("conversation", config.codexModel));
    expect(chat).not.toBe(cacheSessionId("conversation", config.codexModel, "plan"));
    expect(chat).not.toBe(cacheSessionId("conversation", "gpt-5.6-terra"));
  });
});
