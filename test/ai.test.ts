import { describe, expect, test } from "bun:test";
import {
  cacheSessionId,
  DEFAULT_CODEX_MODEL,
  DEFAULT_THINKING_LEVEL,
  getCodexModels,
  resolveAiSettings,
} from "../src/ai";

describe("Codex設定", () => {
  test("providerのモデル一覧にデフォルトモデルがある", () => {
    expect(getCodexModels().some((model) => model.id === DEFAULT_CODEX_MODEL)).toBe(true);
  });

  test("不正な保存値をデフォルトへ戻す", () => {
    expect(resolveAiSettings("unknown", "max")).toEqual({
      model: DEFAULT_CODEX_MODEL,
      thinking: DEFAULT_THINKING_LEVEL,
    });
  });

  test("会話・用途・モデル単位でキャッシュセッションを分離する", () => {
    const chat = cacheSessionId("conversation", DEFAULT_CODEX_MODEL);
    expect(chat).toBe(cacheSessionId("conversation", DEFAULT_CODEX_MODEL));
    expect(chat).not.toBe(cacheSessionId("conversation", DEFAULT_CODEX_MODEL, "plan"));
    expect(chat).not.toBe(cacheSessionId("conversation", "gpt-5.6-terra"));
  });
});
