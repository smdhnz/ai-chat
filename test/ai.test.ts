import { describe, expect, test } from "bun:test";
import type { Model } from "@earendil-works/pi-ai";
import {
  DEFAULT_THINKING_LEVEL,
  isAuthenticationError,
  resolveAiSettings,
  resolveRunThinking,
  resolveThinkingLevel,
} from "../src/api/ai";
import { config } from "../src/api/config";

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

  test("explicitでは初回だけtitleを生成し、auto失敗時はmediumへfallbackする", async () => {
    let calls = 0;
    const classify = async () => {
      calls++;
      return { thinking: "minimal" as const, title: "生成した題名" };
    };
    expect(await resolveRunThinking("high", model, classify)).toEqual({
      resolved: "high",
      title: "",
    });
    expect(calls).toBe(0);
    expect(await resolveRunThinking("high", model, classify, true)).toEqual({
      resolved: "high",
      title: "生成した題名",
    });
    expect(calls).toBe(1);
    expect(
      await resolveRunThinking("auto", model, async () => Promise.reject(new Error("fail"))),
    ).toEqual({ resolved: "medium", title: "" });
  });
});
