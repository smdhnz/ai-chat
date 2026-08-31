const exaMcpUrl = "https://mcp.exa.ai/mcp?tools=web_search_exa";

type McpResponse = {
  result?: { content?: { type?: string; text?: string }[]; isError?: boolean };
  error?: { message?: string };
};

export async function webSearch(
  query: string,
  maxResults = 5,
  signal?: AbortSignal,
): Promise<string> {
  const searchSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
    : AbortSignal.timeout(30_000);
  const response = await fetch(exaMcpUrl, {
    method: "POST",
    headers: { Accept: "application/json, text/event-stream", "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "web_search_exa",
        arguments: {
          query: query.slice(0, 500),
          numResults: Math.max(1, Math.min(8, Math.trunc(maxResults))),
        },
      },
    }),
    signal: searchSignal,
  });
  if (!response.ok) throw new Error(`Web検索に失敗しました: HTTP ${response.status}`);

  return parseWebSearchResponse(await response.text()).slice(0, 30_000);
}

export function parseWebSearchResponse(body: string): string {
  const payloads = body
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim());
  if (payloads.length === 0) payloads.push(body);
  for (const payload of payloads) {
    try {
      const data = JSON.parse(payload) as McpResponse;
      if (data.error) throw new Error(data.error.message || "Web検索に失敗しました");
      const text = data.result?.content?.find((item) => item.type === "text")?.text?.trim();
      if (data.result?.isError) throw new Error(text || "Web検索に失敗しました");
      if (text) return text;
    } catch (error) {
      if (error instanceof SyntaxError) continue;
      throw error;
    }
  }
  throw new Error("Web検索結果を取得できませんでした");
}
