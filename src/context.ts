export function isContextLarge(
  inputTokens: number,
  contextWindow: number,
  maxOutputTokens: number,
): boolean {
  return inputTokens > (contextWindow - maxOutputTokens) * 0.8;
}
