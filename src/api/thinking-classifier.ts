import type { ThinkingClassification } from "./ai";

export function parseThinkingClassification(
  value: unknown,
  needsTitle: boolean,
): ThinkingClassification {
  if (typeof value !== "object" || value === null)
    throw new Error("invalid thinking classification");
  const result = value as Record<string, unknown>;
  if (!["minimal", "low", "medium", "high"].includes(String(result.thinking)))
    throw new Error("invalid thinking classification");
  return {
    thinking: result.thinking as ThinkingClassification["thinking"],
    title: needsTitle && typeof result.title === "string" ? result.title.trim() : "",
  };
}
