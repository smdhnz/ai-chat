export function getCodexAccountId(token: string): string {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("Invalid Codex access token");
  let decoded: unknown;
  try {
    decoded = JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(),
    );
  } catch {
    throw new Error("Invalid Codex access token");
  }
  const claims = decoded && typeof decoded === "object" ? (decoded as Record<string, unknown>) : {};
  const auth = claims["https://api.openai.com/auth"];
  const id =
    auth && typeof auth === "object"
      ? (auth as Record<string, unknown>).chatgpt_account_id
      : undefined;
  if (typeof id !== "string" || !id) throw new Error("Codex account ID is missing");
  return id;
}
