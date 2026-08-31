import { describe, expect, test } from "bun:test";
import type { Model } from "@earendil-works/pi-ai";
import {
  DEFAULT_THINKING_LEVEL,
  isAuthenticationError,
  resolveAiSettings,
  resolveRunThinking,
  resolveThinkingLevel,
} from "../src/ai";
import { config } from "../src/config";

const model: Model<"openai-responses"> = {
  id: "fake",
  name: "Fake",
  api: "openai-responses",
  provider: "openai",
  baseUrl: "http://localhost",
  reasoning: true,
  thinkingLevelMap: { xhigh: null, max: null },
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1_000,
  maxTokens: 100,
};

describe("Codex設定", () => {
  test("設定モデルを解決できる", () => {
    expect(resolveAiSettings("auto").model).toBe(config.codexModel);
  });

  test("未設定providerを認証エラーとして扱う", () => {
    expect(isAuthenticationError(new Error("Provider is not configured: openai-codex"))).toBe(true);
  });

  test("設定値を拡張し、不正値だけ既定値へ戻す", () => {
    expect(resolveAiSettings("max").thinking).toBe("max");
    expect(resolveAiSettings("invalid").thinking).toBe(DEFAULT_THINKING_LEVEL);
  });

  test("unsupported levelを最も近い低いlevelへ解決する", () => {
    expect(resolveThinkingLevel(model, "max")).toBe("high");
  });

  test("explicitではclassifierを呼ばず、auto失敗時はmediumへfallbackする", async () => {
    let calls = 0;
    expect(
      await resolveRunThinking("high", model, async () => {
        calls++;
        return { thinking: "minimal", title: "ignored" };
      }),
    ).toEqual({ resolved: "high", title: "" });
    expect(calls).toBe(0);
    expect(
      await resolveRunThinking("auto", model, async () => Promise.reject(new Error("fail"))),
    ).toEqual({ resolved: "medium", title: "" });
  });
});
