import type { Database } from "bun:sqlite";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Context, Message, Usage } from "@earendil-works/pi-ai";
import {
  decodeStoredEntry,
  hydrateStoredEntry,
  listConversationEntries,
  validateToolResultLinks,
  type ConversationEntry,
  type StoredContent,
} from "./agent-messages";
import { conversationSummaryMessage } from "./prompt";

export const COMPACTION_RESERVE_TOKENS = 16_384;
export const COMPACTION_KEEP_RECENT_TOKENS = 20_000;

export type CompactionCheckpoint = {
  summary: string;
  tokensBefore: number;
  firstKeptSequence: number;
  usage: Usage;
  createdAt: string;
};

export type SummarizeConversation = (
  payload: string,
  signal?: AbortSignal,
) => Promise<{ summary: string; usage: Usage }>;

export class CompactionCheckpointError extends Error {}

export function shouldCompact(
  contextTokens: number,
  contextWindow: number,
  reserveTokens = COMPACTION_RESERVE_TOKENS,
): boolean {
  return contextTokens > contextWindow - reserveTokens;
}

export function estimateActiveContext(context: Context): number {
  let lastUsageIndex = -1;
  let usageTokens = 0;
  let latestPrefixTimestamp = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < context.messages.length; index++) {
    const message = context.messages[index];
    if (
      message.role === "assistant" &&
      message.timestamp >= latestPrefixTimestamp &&
      message.stopReason !== "aborted" &&
      message.stopReason !== "error" &&
      totalUsage(message.usage) > 0
    ) {
      lastUsageIndex = index;
      usageTokens = totalUsage(message.usage);
    }
    latestPrefixTimestamp = Math.max(latestPrefixTimestamp, message.timestamp);
  }
  if (lastUsageIndex >= 0)
    return (
      usageTokens +
      context.messages
        .slice(lastUsageIndex + 1)
        .reduce((sum, message) => sum + estimateMessageTokens(message), 0)
    );
  return (
    estimateTextTokens(context.systemPrompt ?? "") +
    estimateTextTokens(JSON.stringify(context.tools ?? []) ?? "") +
    context.messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0)
  );
}

export function findCompactionCut(
  entries: readonly ConversationEntry[],
  keepRecentTokens = COMPACTION_KEEP_RECENT_TOKENS,
): number | null {
  const transcript = entries.filter(isTranscriptEntry);
  if (transcript.length < 2) return null;
  const units = atomicUnits(transcript);
  let latestUser = -1;
  for (let index = transcript.length - 1; index >= 0; index--)
    if (transcript[index].kind === "user_message") {
      latestUser = index;
      break;
    }
  if (latestUser < 0) return null;

  let tokens = 0;
  let chosen = units.length - 1;
  for (let index = units.length - 1; index >= 0; index--) {
    tokens += units[index].tokens;
    chosen = index;
    if (tokens >= keepRecentTokens && units[index].start <= latestUser) break;
  }
  const safeBoundary = chosen;
  while (chosen > 0 && transcript[units[chosen].start].kind !== "user_message") chosen -= 1;
  if (chosen === 0 && safeBoundary > 0) chosen = safeBoundary;
  if (units[chosen].start === 0) return null;
  return transcript[units[chosen].start].sequence;
}

export async function hydrateActiveContext(
  database: Database,
  conversationId: string,
  userId: string,
): Promise<{
  messages: Message[];
  checkpoint: CompactionCheckpoint | null;
  entries: ConversationEntry[];
}> {
  const allEntries = listConversationEntries(database, conversationId);
  const checkpoint = latestCheckpoint(allEntries);
  const entries = allEntries.filter(
    (entry) =>
      isTranscriptEntry(entry) && (!checkpoint || entry.sequence >= checkpoint.firstKeptSequence),
  );
  const messages = (
    await Promise.all(entries.map((entry) => hydrateStoredEntry(database, entry, userId)))
  ).filter((message): message is Message => message !== null);
  if (checkpoint)
    messages.unshift({
      role: "user",
      content: conversationSummaryMessage(checkpoint.summary),
      timestamp: Date.parse(checkpoint.createdAt),
    });
  validateToolResultLinks(messages);
  return { messages, checkpoint, entries };
}

export async function compactConversation(input: {
  database: Database;
  conversationId: string;
  userId: string;
  runId: string;
  systemPrompt: string;
  tools: AgentTool[];
  contextWindow: number;
  summarize: SummarizeConversation;
  signal?: AbortSignal;
  force?: boolean;
  reserveTokens?: number;
  keepRecentTokens?: number;
  now?: () => string;
  id?: () => string;
}): Promise<{ messages: Message[]; compacted: boolean; tokensBefore: number }> {
  const active = await hydrateActiveContext(input.database, input.conversationId, input.userId);
  const context: Context = {
    systemPrompt: input.systemPrompt,
    messages: active.messages,
    tools: input.tools,
  };
  const tokensBefore = estimateActiveContext(context);
  if (!input.force && !shouldCompact(tokensBefore, input.contextWindow, input.reserveTokens))
    return { messages: active.messages, compacted: false, tokensBefore };

  const firstKeptSequence = findCompactionCut(active.entries, input.keepRecentTokens);
  if (firstKeptSequence === null) {
    if (input.force)
      throw new Error("context cannot be compacted without dropping the latest request");
    return { messages: active.messages, compacted: false, tokensBefore };
  }
  const summarizedEntries = active.entries.filter((entry) => entry.sequence < firstKeptSequence);
  const payload = serializeCompactionInput(
    input.database,
    active.checkpoint?.summary,
    summarizedEntries,
  );
  const result = await input.summarize(payload, input.signal);
  const summary = result.summary.trim();
  if (!summary) throw new Error("compaction summary is empty");
  const createdAt = (input.now ?? (() => new Date().toISOString()))();
  const checkpoint: CompactionCheckpoint = {
    summary,
    tokensBefore,
    firstKeptSequence,
    usage: result.usage,
    createdAt,
  };
  try {
    input.database.transaction(() => {
      const sequence = (
        input.database
          .query(
            "SELECT COALESCE(MAX(sequence),0)+1 AS sequence FROM conversation_entries WHERE conversation_id=?",
          )
          .get(input.conversationId) as { sequence: number }
      ).sequence;
      input.database
        .query(
          `INSERT INTO conversation_entries(id,conversation_id,run_id,sequence,kind,payload_json,created_at)
           VALUES(?,?,?,?,?,?,?)`,
        )
        .run(
          (input.id ?? (() => crypto.randomUUID()))(),
          input.conversationId,
          input.runId,
          sequence,
          "compaction",
          JSON.stringify(checkpoint),
          createdAt,
        );
      input.database
        .query(
          "UPDATE conversations SET context_summary=?,compacted_through_id=?,context_tokens=? WHERE id=?",
        )
        .run(summary, summarizedEntries.at(-1)?.id ?? null, tokensBefore, input.conversationId);
    })();
  } catch (error) {
    throw new CompactionCheckpointError(
      `compaction checkpoint persistence failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const rebuilt = await hydrateActiveContext(input.database, input.conversationId, input.userId);
  return { messages: rebuilt.messages, compacted: true, tokensBefore };
}

export function serializeCompactionInput(
  database: Database,
  previousSummary: string | undefined,
  entries: readonly ConversationEntry[],
): string {
  const transcript = entries
    .map((entry) => serializeEntry(database, entry))
    .filter(Boolean)
    .join("\n\n");
  const boundedTranscript = transcript.length > 480_000 ? transcript.slice(-480_000) : transcript;
  return [
    `<previous_summary>\n${previousSummary ?? ""}\n</previous_summary>`,
    `<conversation_to_summarize>\n${boundedTranscript}\n</conversation_to_summarize>`,
  ].join("\n\n");
}

function latestCheckpoint(entries: readonly ConversationEntry[]): CompactionCheckpoint | null {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (entry.kind !== "compaction") continue;
    const payload = decodeStoredEntry(entry);
    if (!("summary" in payload) || typeof payload.summary !== "string") continue;
    if ("firstKeptSequence" in payload && typeof payload.firstKeptSequence === "number")
      return payload as CompactionCheckpoint;
    if ("compactedThroughId" in payload && typeof payload.compactedThroughId === "string") {
      const through = entries.find((candidate) => candidate.id === payload.compactedThroughId);
      if (through)
        return {
          summary: payload.summary,
          tokensBefore: 0,
          firstKeptSequence: through.sequence + 1,
          usage: zeroUsage,
          createdAt: entry.created_at,
        };
    }
  }
  return null;
}

function atomicUnits(entries: readonly ConversationEntry[]) {
  const units: { start: number; end: number; tokens: number }[] = [];
  for (let index = 0; index < entries.length; index++) {
    const start = index;
    const payload = decodeStoredEntry(entries[index]);
    const pending =
      entries[index].kind === "assistant_message" && "content" in payload
        ? new Set(
            (payload.content as StoredContent[])
              .filter((block) => block.type === "toolCall" && typeof block.id === "string")
              .map((block) => (block as Extract<StoredContent, { type: "toolCall" }>).id),
          )
        : new Set<string>();
    while (
      pending.size &&
      index + 1 < entries.length &&
      entries[index + 1].kind === "tool_result"
    ) {
      index += 1;
      const result = decodeStoredEntry(entries[index]);
      if ("toolCallId" in result && typeof result.toolCallId === "string")
        pending.delete(result.toolCallId);
    }
    units.push({
      start,
      end: index,
      tokens: entries.slice(start, index + 1).reduce((sum, entry) => sum + entryTokens(entry), 0),
    });
  }
  return units;
}

function entryTokens(entry: ConversationEntry): number {
  const payload = decodeStoredEntry(entry);
  if (!("content" in payload) || !Array.isArray(payload.content)) return 0;
  let tokens = 0;
  for (const block of payload.content as StoredContent[]) {
    if (isTextBlock(block)) tokens += estimateTextTokens(block.text);
    else if (isThinkingBlock(block)) tokens += estimateTextTokens(block.thinking);
    else if (isImageRef(block)) tokens += 1_200;
    else if (isToolCallBlock(block))
      tokens += estimateTextTokens(`${block.name}${JSON.stringify(block.arguments)}`);
  }
  return tokens;
}

function serializeEntry(database: Database, entry: ConversationEntry): string {
  const payload = decodeStoredEntry(entry);
  if (!("content" in payload) || !Array.isArray(payload.content)) return "";
  const content = payload.content as StoredContent[];
  if (entry.kind === "user_message") return `[User]\n${serializeContent(database, content)}`;
  if (entry.kind === "assistant_message") {
    const blocks = content.flatMap((block) => {
      if (isThinkingBlock(block))
        return [`[Assistant reasoning summary] ${block.thinking.slice(0, 8_000)}`];
      if (isTextBlock(block)) return [block.text];
      if (isToolCallBlock(block))
        return [
          `[Assistant tool call] ${block.name} ${JSON.stringify(
            block.name === "load_skill" ? { name: block.arguments.name } : block.arguments,
          ).slice(0, 8_000)}`,
        ];
      if (isImageRef(block)) return [imageReference(database, block)];
      return [];
    });
    return `[Assistant]\n${blocks.join("\n")}`;
  }
  if (entry.kind === "tool_result") {
    const name =
      "toolName" in payload && typeof payload.toolName === "string" ? payload.toolName : "tool";
    const details = "details" in payload && isRecord(payload.details) ? payload.details : {};
    if (name === "web_search")
      return `[Tool result: web_search]\nSource URLs: ${sourceUrls(details).join(" ") || "none"}`;
    if (name === "load_skill")
      return `[Tool result: load_skill]\nLoaded skill: ${typeof details.name === "string" ? details.name : "unknown"}`;
    return `[Tool result: ${name}]\n${serializeContent(database, content).slice(0, 12_000)}`;
  }
  return "";
}

function serializeContent(database: Database, content: StoredContent[]): string {
  return content
    .flatMap((block) => {
      if (isTextBlock(block)) return [block.text];
      if (isImageRef(block)) return [imageReference(database, block)];
      return [];
    })
    .join("\n");
}

function imageReference(
  database: Database,
  block: Extract<StoredContent, { type: "imageRef" }>,
): string {
  const file = database.query("SELECT name,source FROM files WHERE id=?").get(block.fileId) as {
    name: string;
    source: string;
  } | null;
  return `[Image fileId=${block.fileId} name=${file?.name ?? "unknown"} source=${file?.source ?? "unknown"}]`;
}

function sourceUrls(details: Record<string, unknown>): string[] {
  return Array.isArray(details.sources)
    ? details.sources.flatMap((source) =>
        isRecord(source) && typeof source.url === "string" ? [source.url] : [],
      )
    : [];
}

function isTranscriptEntry(entry: ConversationEntry): boolean {
  return ["user_message", "assistant_message", "tool_result"].includes(entry.kind);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTextBlock(block: StoredContent): block is Extract<StoredContent, { type: "text" }> {
  return block.type === "text" && "text" in block && typeof block.text === "string";
}

function isThinkingBlock(
  block: StoredContent,
): block is Extract<StoredContent, { type: "thinking" }> {
  return block.type === "thinking" && "thinking" in block && typeof block.thinking === "string";
}

function isToolCallBlock(
  block: StoredContent,
): block is Extract<StoredContent, { type: "toolCall" }> {
  return (
    block.type === "toolCall" &&
    "name" in block &&
    typeof block.name === "string" &&
    "arguments" in block &&
    isRecord(block.arguments)
  );
}

function isImageRef(block: StoredContent): block is Extract<StoredContent, { type: "imageRef" }> {
  return (
    block.type === "imageRef" &&
    "fileId" in block &&
    typeof block.fileId === "string" &&
    "mimeType" in block &&
    typeof block.mimeType === "string"
  );
}

function estimateMessageTokens(message: Message): number {
  if (message.role === "user" || message.role === "toolResult") {
    if (typeof message.content === "string") return estimateTextTokens(message.content);
    return message.content.reduce(
      (sum, block) => sum + (block.type === "text" ? estimateTextTokens(block.text) : 1_200),
      0,
    );
  }
  return message.content.reduce((sum, block) => {
    if (block.type === "text") return sum + estimateTextTokens(block.text);
    if (block.type === "thinking") return sum + estimateTextTokens(block.thinking);
    return sum + estimateTextTokens(`${block.name}${JSON.stringify(block.arguments)}`);
  }, 0);
}

function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function totalUsage(usage: Usage): number {
  return usage.totalTokens || usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
}

const zeroUsage: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};
