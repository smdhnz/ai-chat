import type { ChatEventEnvelope, Message, PublicActivity, RunStatus } from "@/lib/api";

export const conversationIdFromPath = (pathname: string): string | null =>
  pathname.match(/^\/chat\/([\w-]+)$/)?.[1] || null;

export function chatBottomDistance(
  scrollHeight: number,
  clientHeight: number,
  scrollTop: number,
): number {
  return scrollHeight - clientHeight - scrollTop;
}

export function isNearChatBottom(
  scrollHeight: number,
  clientHeight: number,
  scrollTop: number,
): boolean {
  return chatBottomDistance(scrollHeight, clientHeight, scrollTop) <= 32;
}

export function isFarFromChatBottom(
  scrollHeight: number,
  clientHeight: number,
  scrollTop: number,
): boolean {
  return chatBottomDistance(scrollHeight, clientHeight, scrollTop) > 160;
}

export function chatUrl(path: string, temporary: boolean, projectId = ""): string {
  const params = new URLSearchParams();
  if (temporary) params.set("temporary", "1");
  if (projectId) params.set("project", projectId);
  const query = params.toString();
  return `${path}${query ? `?${query}` : ""}`;
}

type StreamActivity = { key: string; value: PublicActivity };
export type ChatStream = {
  conversationId: string;
  runId: string;
  lastSeq: number;
  status: RunStatus;
  content: string;
  activities: StreamActivity[];
  createdAt: string;
};
export type ChatStreams = Record<string, ChatStream>;
export type ChatStreamAction =
  { type: "event"; envelope: ChatEventEnvelope } | { type: "clear"; conversationId: string };

export function isChatEventEnvelope(value: unknown): value is ChatEventEnvelope {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const envelope = value as Record<string, unknown>;
  if (
    envelope.version !== 1 ||
    typeof envelope.conversationId !== "string" ||
    typeof envelope.runId !== "string" ||
    typeof envelope.seq !== "number" ||
    !Number.isSafeInteger(envelope.seq) ||
    envelope.seq < 1 ||
    typeof envelope.timestamp !== "string" ||
    typeof envelope.event !== "object" ||
    envelope.event === null ||
    Array.isArray(envelope.event)
  )
    return false;
  const event = envelope.event as Record<string, unknown>;
  if (event.type === "run.status")
    return ["queued", "running", "completed", "stopped", "failed"].includes(String(event.status));
  if (event.type === "turn.start") return typeof event.turn === "number";
  if (event.type === "assistant.text.delta" || event.type === "assistant.reasoning.delta")
    return typeof event.contentIndex === "number" && typeof event.delta === "string";
  if (event.type === "assistant.tool_call.start")
    return (
      typeof event.contentIndex === "number" &&
      typeof event.id === "string" &&
      typeof event.name === "string"
    );
  if (event.type === "assistant.tool_call.delta")
    return typeof event.contentIndex === "number" && typeof event.delta === "string";
  if (event.type === "tool.start")
    return typeof event.id === "string" && typeof event.name === "string";
  if (event.type === "tool.update")
    return (
      typeof event.id === "string" &&
      typeof event.name === "string" &&
      typeof event.summary === "string"
    );
  if (event.type === "tool.end")
    return (
      typeof event.id === "string" &&
      typeof event.name === "string" &&
      typeof event.isError === "boolean"
    );
  if (event.type === "message.final")
    return typeof event.entry === "object" && event.entry !== null && !Array.isArray(event.entry);
  if (event.type === "compaction.end") return typeof event.tokensBefore === "number";
  if (event.type === "run.error") return typeof event.message === "string";
  return event.type === "compaction.start" || event.type === "run.done";
}

export function reduceChatStreams(state: ChatStreams, action: ChatStreamAction): ChatStreams {
  if (action.type === "clear") {
    if (!state[action.conversationId]) return state;
    const next = { ...state };
    delete next[action.conversationId];
    return next;
  }
  const envelope = action.envelope;
  const previous = state[envelope.conversationId];
  if (previous?.runId === envelope.runId && envelope.seq <= previous.lastSeq) return state;
  const stream: ChatStream =
    previous?.runId === envelope.runId
      ? { ...previous, activities: [...previous.activities], lastSeq: envelope.seq }
      : {
          conversationId: envelope.conversationId,
          runId: envelope.runId,
          lastSeq: envelope.seq,
          status: "queued",
          content: "",
          activities: [],
          createdAt: envelope.timestamp,
        };
  const event = envelope.event;
  if (event.type === "run.status") stream.status = event.status;
  else if (event.type === "assistant.text.delta") stream.content += event.delta;
  else if (event.type === "assistant.reasoning.delta")
    upsertActivity(stream, `reasoning:${event.contentIndex}`, (current) => ({
      type: "reasoning",
      text: `${current?.type === "reasoning" ? current.text : ""}${event.delta}`,
    }));
  else if (event.type === "tool.start")
    upsertActivity(stream, `tool:${event.id}`, () => runningTool(event.name, event.args));
  else if (event.type === "tool.update")
    upsertActivity(stream, `tool:${event.id}`, (current) =>
      current?.type === "tool"
        ? { ...current, summary: event.summary }
        : runningTool(event.name, {}),
    );
  else if (event.type === "tool.end")
    upsertActivity(stream, `tool:${event.id}`, (current) =>
      completedTool(event.name, event.result, event.isError, current),
    );
  else if (event.type === "compaction.start")
    upsertActivity(stream, "compaction", () => ({
      type: "tool",
      name: "context_compaction",
      summary: "会話履歴を整理中",
      status: "running",
    }));
  else if (event.type === "compaction.end")
    upsertActivity(stream, "compaction", () => ({
      type: "tool",
      name: "context_compaction",
      summary: "会話履歴を整理しました",
      status: "completed",
    }));
  else if (event.type === "run.error")
    upsertActivity(stream, "run:error", () => ({
      type: "tool",
      name: "run",
      summary: event.message,
      status: "error",
    }));
  return { ...state, [envelope.conversationId]: stream };
}

export function streamMessage(stream: ChatStream): Message {
  return {
    id: `stream-${stream.runId}`,
    runId: stream.runId,
    role: "assistant",
    content: stream.content,
    files: [],
    activities: stream.activities.map(({ value }) => value),
    status: stream.status === "failed" || stream.status === "stopped" ? stream.status : "completed",
    created_at: stream.createdAt,
  };
}

function upsertActivity(
  stream: ChatStream,
  key: string,
  update: (current: PublicActivity | undefined) => PublicActivity,
): void {
  const index = stream.activities.findIndex((activity) => activity.key === key);
  const current = index < 0 ? undefined : stream.activities[index].value;
  const next = { key, value: update(current) };
  if (index < 0) stream.activities.push(next);
  else stream.activities[index] = next;
}

function runningTool(name: string, args: unknown): PublicActivity {
  const input = record(args);
  if (name === "web_search")
    return {
      type: "web_search",
      query: text(input.query),
      sources: [],
      status: "running",
    };
  if (name === "generate_image") return { type: "image_generation", status: "running" };
  if (name === "load_skill")
    return { type: "skill", name: text(input.name) || "unknown", status: "running" };
  return { type: "tool", name, summary: "処理中", status: "running" };
}

function completedTool(
  name: string,
  result: unknown,
  isError: boolean,
  current: PublicActivity | undefined,
): PublicActivity {
  const details = record(result);
  const status = isError ? "error" : "completed";
  if (name === "web_search")
    return {
      type: "web_search",
      query: text(details.query) || (current?.type === "web_search" ? current.query : ""),
      sources: Array.isArray(details.sources)
        ? details.sources.flatMap((source) => {
            const item = record(source);
            return text(item.url)
              ? [{ title: text(item.title) || text(item.url), url: text(item.url) }]
              : [];
          })
        : [],
      status,
    };
  if (name === "load_skill")
    return {
      type: "skill",
      name: text(details.name) || (current?.type === "skill" ? current.name : "unknown"),
      status,
    };
  if (name === "generate_image")
    return {
      type: "image_generation",
      operation:
        details.operation === "generation" || details.operation === "edit"
          ? details.operation
          : undefined,
      status,
    };
  return {
    type: "tool",
    name,
    summary: isError ? "処理に失敗しました" : "処理が完了しました",
    status,
  };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
