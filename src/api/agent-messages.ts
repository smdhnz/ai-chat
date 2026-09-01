import { and, asc, desc, eq, gt, gte, inArray, lt, max } from "drizzle-orm";
import type { Database } from "./database";
import { readFile } from "node:fs/promises";
import type {
  Api,
  AssistantMessage,
  ImageContent,
  Message,
  ProviderId,
  StopReason,
  ToolResultMessage,
  Usage,
} from "@earendil-works/pi-ai";
import { storedFilePath } from "./config";
import { conversationEntries, conversations, files, runs } from "./schema";

export type StoredContent =
  | { type: "text"; text: string; textSignature?: string }
  | {
      type: "thinking";
      thinking: string;
      thinkingSignature?: string;
      redacted?: boolean;
    }
  | {
      type: "toolCall";
      id: string;
      name: string;
      arguments: Record<string, unknown>;
      thoughtSignature?: string;
    }
  | { type: "imageRef"; fileId: string; mimeType: string }
  | (Record<string, unknown> & { type: string });

type UserPayload = {
  role: "user";
  content: StoredContent[];
  authorId?: string;
  attachmentContext?: string;
  skills?: string[];
};
type AssistantPayload = {
  role: "assistant";
  content: StoredContent[];
  api: Api;
  provider: ProviderId;
  model: string;
  usage: Usage;
  stopReason: StopReason;
  errorMessage?: string;
  skills?: string[];
};
type ToolResultPayload = Omit<ToolResultMessage, "content" | "timestamp"> & {
  role: "toolResult";
  content: StoredContent[];
};
export type CompactionPayload = {
  summary: string;
  compactedThroughId?: string;
  tokensBefore?: number;
  firstKeptSequence?: number;
  usage?: Usage;
  createdAt?: string;
};
export type StoredPayload = UserPayload | AssistantPayload | ToolResultPayload | CompactionPayload;

export type ConversationEntry = {
  id: string;
  conversation_id: string;
  run_id: string | null;
  sequence: number;
  kind: "user_message" | "assistant_message" | "tool_result" | "compaction" | "activity";
  payload_json: string;
  created_at: string;
};

type ActivityStatus = "running" | "completed" | "error";

export type PublicActivity =
  | { type: "reasoning"; text: string; redacted?: boolean }
  | {
      type: "web_search";
      query: string;
      sources: { title: string; url: string }[];
      status: ActivityStatus;
    }
  | {
      type: "image_generation";
      operation?: "generation" | "edit";
      status: ActivityStatus;
    }
  | { type: "skill"; name: string; status: ActivityStatus }
  | { type: "tool"; name: string; summary: string; status: ActivityStatus };

export type PublicTranscriptMessage = {
  id: string;
  runId?: string;
  role: "user" | "assistant";
  content: string;
  fileIds: string[];
  authorId?: string;
  skills: string[];
  activities: PublicActivity[];
  status?: "completed" | "stopped" | "failed";
  created_at: string;
};

export type LegacyMessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  file_ids: string;
  skills: string;
  attachment_context: string;
  created_at: string;
};

const zeroUsage: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function publicToolCall(
  call: { name: string; arguments: unknown },
  status: "running" | "error",
): PublicActivity {
  const details = isRecord(call.arguments) ? call.arguments : {};
  if (call.name === "web_search")
    return {
      type: "web_search",
      query: typeof details.query === "string" ? details.query.slice(0, 500) : "",
      sources: [],
      status,
    };
  if (call.name === "generate_image") return { type: "image_generation", status };
  if (call.name === "load_skill")
    return {
      type: "skill",
      name: typeof details.name === "string" ? details.name.slice(0, 80) : "unknown",
      status,
    };
  return {
    type: "tool",
    name: call.name.slice(0, 100),
    summary: status === "running" ? "処理中" : "処理が完了しませんでした",
    status,
  };
}

function publicToolActivity(result: ToolResultPayload, previous?: PublicActivity): PublicActivity {
  const status = result.isError ? "error" : "completed";
  const details = isRecord(result.details) ? result.details : {};
  if (result.toolName === "web_search")
    return {
      type: "web_search",
      query: typeof details.query === "string" ? details.query.slice(0, 500) : "",
      sources: Array.isArray(details.sources)
        ? details.sources.slice(0, 8).flatMap((source) =>
            isRecord(source) && typeof source.url === "string"
              ? [
                  {
                    title:
                      typeof source.title === "string"
                        ? source.title.slice(0, 300)
                        : source.url.slice(0, 300),
                    url: source.url.slice(0, 2_000),
                  },
                ]
              : [],
          )
        : [],
      status,
    };
  if (result.toolName === "load_skill")
    return {
      type: "skill",
      name:
        typeof details.name === "string"
          ? details.name.slice(0, 80)
          : previous?.type === "skill"
            ? previous.name
            : "unknown",
      status,
    };
  if (result.toolName === "generate_image")
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
    name: result.toolName.slice(0, 100),
    summary: result.isError ? "処理に失敗しました" : "処理が完了しました",
    status,
  };
}

export function decodeStoredEntry(
  entry: Pick<ConversationEntry, "kind" | "payload_json">,
): StoredPayload {
  let payload: unknown;
  try {
    payload = JSON.parse(entry.payload_json);
  } catch (error) {
    throw new Error(
      `conversation transcript is corrupt: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  if (!isRecord(payload)) throw new Error("conversation transcript payload must be an object");
  const expectedRole =
    entry.kind === "user_message"
      ? "user"
      : entry.kind === "assistant_message"
        ? "assistant"
        : entry.kind === "tool_result"
          ? "toolResult"
          : undefined;
  if (expectedRole && payload.role !== expectedRole)
    throw new Error(`conversation transcript kind/role mismatch: ${entry.kind}`);
  if (expectedRole && !Array.isArray(payload.content))
    throw new Error(`conversation transcript content is invalid: ${entry.kind}`);
  if (
    entry.kind === "assistant_message" &&
    (!["api", "provider", "model", "usage", "stopReason"].every((key) => key in payload) ||
      !isRecord(payload.usage))
  )
    throw new Error("conversation transcript assistant metadata is incomplete");
  return payload as StoredPayload;
}

function contentText(content: StoredContent[]): string {
  return content
    .filter((block): block is Extract<StoredContent, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("");
}

export function detectImageMime(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 8 &&
    Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from("89504e470d0a1a0a", "hex"))
  )
    return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
  )
    return "image/webp";
  if (
    bytes.length >= 6 &&
    ["GIF87a", "GIF89a"].includes(Buffer.from(bytes.subarray(0, 6)).toString("ascii"))
  )
    return "image/gif";
  return null;
}

function imageRefs(content: StoredContent[]): string[] {
  return content
    .filter(
      (block): block is Extract<StoredContent, { type: "imageRef" }> =>
        block.type === "imageRef" && typeof block.fileId === "string",
    )
    .map((block) => block.fileId);
}

export function projectLegacyMessage(entry: ConversationEntry): LegacyMessageRow | null {
  if (entry.kind !== "user_message" && entry.kind !== "assistant_message") return null;
  const payload = decodeStoredEntry(entry) as UserPayload | AssistantPayload;
  return {
    id: entry.id,
    role: payload.role,
    content: contentText(payload.content),
    file_ids: JSON.stringify(imageRefs(payload.content)),
    skills: JSON.stringify(payload.skills ?? []),
    attachment_context: payload.role === "user" ? (payload.attachmentContext ?? "") : "",
    created_at: entry.created_at,
  };
}

export function listLegacyMessages(database: Database, conversationId: string): LegacyMessageRow[] {
  return database
    .select()
    .from(conversationEntries)
    .where(
      and(
        eq(conversationEntries.conversation_id, conversationId),
        inArray(conversationEntries.kind, ["user_message", "assistant_message"]),
      ),
    )
    .orderBy(asc(conversationEntries.sequence))
    .all()
    .map((entry) => projectLegacyMessage(entry)!);
}

export function pageLegacyMessages(
  database: Database,
  conversationId: string,
  before: string | null,
  limit: number,
): { messages: LegacyMessageRow[]; hasMore: boolean } {
  const cursor = before
    ? database
        .select({ sequence: conversationEntries.sequence })
        .from(conversationEntries)
        .where(
          and(
            eq(conversationEntries.id, before),
            eq(conversationEntries.conversation_id, conversationId),
          ),
        )
        .get()
    : null;
  if (before && !cursor) throw new Error("invalid cursor");
  const rows = database
    .select()
    .from(conversationEntries)
    .where(
      and(
        eq(conversationEntries.conversation_id, conversationId),
        inArray(conversationEntries.kind, ["user_message", "assistant_message"]),
        cursor ? lt(conversationEntries.sequence, cursor.sequence) : undefined,
      ),
    )
    .orderBy(desc(conversationEntries.sequence))
    .limit(limit + 1)
    .all();
  return {
    messages: rows
      .slice(0, limit)
      .reverse()
      .map((entry) => projectLegacyMessage(entry)!),
    hasMore: rows.length > limit,
  };
}

export function pagePublicMessages(
  database: Database,
  conversationId: string,
  before: string | null,
  limit: number,
): { messages: PublicTranscriptMessage[]; hasMore: boolean } {
  const entries = listConversationEntries(database, conversationId).filter((entry) =>
    ["user_message", "assistant_message", "tool_result"].includes(entry.kind),
  );
  const runMap = new Map(
    database
      .select({ id: runs.id, status: runs.status, error: runs.error })
      .from(runs)
      .where(eq(runs.conversation_id, conversationId))
      .all()
      .map((run) => [run.id, run]),
  );
  const messages: PublicTranscriptMessage[] = [];
  const toolCalls = new Map<string, { group: PublicTranscriptMessage; activityIndex: number }>();
  for (const entry of entries) {
    const payload = decodeStoredEntry(entry);
    if (entry.kind === "user_message") {
      const user = payload as UserPayload;
      messages.push({
        id: entry.id,
        role: "user",
        content: contentText(user.content),
        fileIds: imageRefs(user.content),
        authorId: user.authorId,
        skills: user.skills ?? [],
        activities: [],
        created_at: entry.created_at,
      });
      continue;
    }
    let group: PublicTranscriptMessage | undefined;
    if (entry.run_id)
      for (let index = messages.length - 1; index >= 0; index--)
        if (messages[index].runId === entry.run_id) {
          group = messages[index];
          break;
        }
    if (!group || group.role !== "assistant") {
      group = {
        id: entry.id,
        runId: entry.run_id ?? undefined,
        role: "assistant",
        content: "",
        fileIds: [],
        skills: [],
        activities: [],
        created_at: entry.created_at,
      };
      messages.push(group);
    }
    if (entry.kind === "assistant_message") {
      const assistant = payload as AssistantPayload;
      const text = contentText(assistant.content);
      if (text) group.content += `${group.content ? "\n\n" : ""}${text}`;
      group.fileIds.push(...imageRefs(assistant.content));
      group.skills.push(...(assistant.skills ?? []));
      for (const block of assistant.content) {
        if (
          block.type === "thinking" &&
          "thinking" in block &&
          typeof block.thinking === "string" &&
          block.thinking
        )
          group.activities.push({
            type: "reasoning",
            text: block.redacted ? "推論内容は非公開" : block.thinking,
            redacted: block.redacted === true || undefined,
          });
        if (
          block.type === "toolCall" &&
          typeof block.id === "string" &&
          typeof block.name === "string"
        ) {
          const runStatus = entry.run_id ? runMap.get(entry.run_id)?.status : undefined;
          const activityIndex = group.activities.push(
            publicToolCall(
              { name: block.name, arguments: block.arguments },
              runStatus === "queued" || runStatus === "running" ? "running" : "error",
            ),
          );
          toolCalls.set(`${entry.run_id}:${block.id}`, { group, activityIndex: activityIndex - 1 });
        }
      }
      continue;
    }
    const result = payload as ToolResultPayload;
    group.fileIds.push(...imageRefs(result.content));
    const call = toolCalls.get(`${entry.run_id}:${result.toolCallId}`);
    if (call) {
      call.group.activities[call.activityIndex] = publicToolActivity(
        result,
        call.group.activities[call.activityIndex],
      );
      toolCalls.delete(`${entry.run_id}:${result.toolCallId}`);
    } else group.activities.push(publicToolActivity(result));
  }
  for (const message of messages) {
    message.fileIds = [...new Set(message.fileIds)];
    message.skills = [...new Set(message.skills)];
    const run = message.runId ? runMap.get(message.runId) : undefined;
    if (run?.status === "stopped" || run?.status === "failed") message.status = run.status;
    else if (message.role === "assistant") message.status = "completed";
    if (run?.status === "failed")
      message.activities.push({
        type: "tool",
        name: "run",
        summary: /server restarted/i.test(run.error ?? "")
          ? "サーバー再起動で処理が中断されました"
          : "処理を完了できませんでした",
        status: "error",
      });
  }
  const cursor = before ? messages.findIndex((message) => message.id === before) : messages.length;
  if (before && cursor < 0) throw new Error("invalid cursor");
  const start = Math.max(0, cursor - limit);
  return { messages: messages.slice(start, cursor), hasMore: start > 0 };
}

export function appendLegacyMessage(
  database: Database,
  message: {
    id: string;
    conversationId: string;
    role: "user" | "assistant";
    content: string;
    fileIds?: string[];
    skills?: string[];
    attachmentContext?: string;
    authorId?: string;
    createdAt: string;
    model?: string;
    runId?: string;
  },
): void {
  const content: StoredContent[] = [
    ...(message.content ? [{ type: "text" as const, text: message.content }] : []),
    ...(message.fileIds ?? []).map((fileId) => {
      const file = database
        .select({ mime: files.mime })
        .from(files)
        .where(eq(files.id, fileId))
        .get();
      if (!file) throw new Error(`missing transcript file: ${fileId}`);
      return { type: "imageRef" as const, fileId, mimeType: file.mime };
    }),
  ];
  const payload: UserPayload | AssistantPayload =
    message.role === "user"
      ? {
          role: "user",
          content,
          authorId: message.authorId,
          attachmentContext: message.attachmentContext,
          skills: message.skills,
        }
      : {
          role: "assistant",
          content,
          api: "openai-responses",
          provider: "openai-codex",
          model: message.model ?? "gpt-5.6-sol",
          usage: zeroUsage,
          stopReason: "stop",
          skills: message.skills,
        };
  const currentSequence = database
    .select({ sequence: max(conversationEntries.sequence) })
    .from(conversationEntries)
    .where(eq(conversationEntries.conversation_id, message.conversationId))
    .get()?.sequence;
  const sequence = (currentSequence ?? 0) + 1;
  database
    .insert(conversationEntries)
    .values({
      id: message.id,
      conversation_id: message.conversationId,
      run_id: message.runId ?? null,
      sequence,
      kind: `${message.role}_message`,
      payload_json: JSON.stringify(payload),
      created_at: message.createdAt,
    })
    .run();
}

export function updateAttachmentContext(
  database: Database,
  entryId: string,
  attachmentContext: string,
): void {
  const entry = database
    .select({ kind: conversationEntries.kind, payload_json: conversationEntries.payload_json })
    .from(conversationEntries)
    .where(eq(conversationEntries.id, entryId))
    .get();
  if (!entry || entry.kind !== "user_message") throw new Error("user message not found");
  const payload = decodeStoredEntry(entry) as UserPayload;
  payload.attachmentContext = attachmentContext;
  database
    .update(conversationEntries)
    .set({ payload_json: JSON.stringify(payload) })
    .where(eq(conversationEntries.id, entryId))
    .run();
}

export function rewindConversation(
  database: Database,
  conversationId: string,
  userId: string,
  entryId: string,
  content: string,
): void {
  const entry = database
    .select({
      sequence: conversationEntries.sequence,
      kind: conversationEntries.kind,
      payload_json: conversationEntries.payload_json,
    })
    .from(conversationEntries)
    .innerJoin(conversations, eq(conversations.id, conversationEntries.conversation_id))
    .where(
      and(
        eq(conversationEntries.id, entryId),
        eq(conversationEntries.conversation_id, conversationId),
      ),
    )
    .get();
  if (!entry || entry.kind !== "user_message") throw new Error("user message not found");
  const payload = decodeStoredEntry(entry) as UserPayload;
  payload.authorId = userId;
  const firstText = payload.content.findIndex((block) => block.type === "text");
  if (firstText < 0) payload.content.unshift({ type: "text", text: content });
  else payload.content[firstText] = { ...payload.content[firstText], type: "text", text: content };

  const runIds = database
    .select({ id: runs.id })
    .from(runs)
    .innerJoin(conversationEntries, eq(conversationEntries.id, runs.user_entry_id))
    .where(
      and(
        eq(runs.conversation_id, conversationId),
        gte(conversationEntries.sequence, entry.sequence),
      ),
    )
    .all()
    .map((run) => run.id);
  database
    .delete(conversationEntries)
    .where(
      and(
        eq(conversationEntries.conversation_id, conversationId),
        gt(conversationEntries.sequence, entry.sequence),
      ),
    )
    .run();
  if (runIds.length) database.delete(runs).where(inArray(runs.id, runIds)).run();
  database
    .update(conversationEntries)
    .set({ payload_json: JSON.stringify(payload) })
    .where(eq(conversationEntries.id, entryId))
    .run();

  const checkpoint = database
    .select({ kind: conversationEntries.kind, payload_json: conversationEntries.payload_json })
    .from(conversationEntries)
    .where(
      and(
        eq(conversationEntries.conversation_id, conversationId),
        eq(conversationEntries.kind, "compaction"),
      ),
    )
    .orderBy(desc(conversationEntries.sequence))
    .get();
  const compacted = checkpoint ? (decodeStoredEntry(checkpoint) as CompactionPayload) : null;
  database
    .update(conversations)
    .set({
      context_summary: compacted?.summary ?? "",
      compacted_through_id: compacted?.compactedThroughId ?? null,
      context_tokens: compacted?.tokensBefore ?? 0,
      unread: 0,
    })
    .where(eq(conversations.id, conversationId))
    .run();
}

export function allConversationFileIds(database: Database, conversationId: string): string[] {
  return [
    ...new Set(
      listConversationEntries(database, conversationId).flatMap((entry) => {
        const payload = decodeStoredEntry(entry);
        return "content" in payload && Array.isArray(payload.content)
          ? imageRefs(payload.content as StoredContent[])
          : [];
      }),
    ),
  ];
}

export async function hydrateStoredEntry(
  database: Database,
  entry: ConversationEntry,
  _userId: string,
): Promise<Message | null> {
  void _userId;
  if (!new Set(["user_message", "assistant_message", "tool_result"]).has(entry.kind)) return null;
  const conversation = database
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.id, entry.conversation_id))
    .get();
  if (!conversation) throw new Error("conversation transcript not found");
  const payload = decodeStoredEntry(entry) as UserPayload | AssistantPayload | ToolResultPayload;
  const content: (StoredContent | ImageContent)[] = [];
  for (const block of payload.content) {
    if (block.type !== "imageRef") {
      if (block.type === "text" || block.type === "thinking" || block.type === "toolCall")
        content.push(block);
      continue;
    }
    if (
      !("fileId" in block) ||
      typeof block.fileId !== "string" ||
      typeof block.mimeType !== "string"
    )
      throw new Error("conversation transcript image reference is invalid");
    const file = database
      .select({ path: files.path, mime: files.mime })
      .from(files)
      .where(eq(files.id, block.fileId))
      .get();
    if (
      !file ||
      file.mime !== block.mimeType ||
      !isConversationFile(database, entry.conversation_id, block.fileId)
    )
      throw new Error("conversation transcript image mismatch");
    const bytes = Buffer.from(await readFile(storedFilePath(file.path)));
    if (detectImageMime(bytes) !== file.mime)
      throw new Error("conversation transcript image MIME mismatch");
    content.push({
      type: "image",
      mimeType: file.mime,
      data: bytes.toString("base64"),
    });
  }
  if (payload.role === "user")
    return {
      role: "user",
      content: content.filter(
        (block): block is Extract<typeof block, { type: "text" | "image" }> =>
          block.type === "text" || block.type === "image",
      ),
      timestamp: Date.parse(entry.created_at),
    } as Message;
  if (payload.role === "assistant")
    return {
      ...payload,
      content: content.filter(
        (block) => block.type === "text" || block.type === "thinking" || block.type === "toolCall",
      ),
      timestamp: Date.parse(entry.created_at),
    } as AssistantMessage;
  return {
    ...payload,
    content: content.filter((block) => block.type === "text" || block.type === "image"),
    timestamp: Date.parse(entry.created_at),
  } as ToolResultMessage;
}

function isConversationFile(database: Database, conversationId: string, fileId: string): boolean {
  const entries = database
    .select({ kind: conversationEntries.kind, payload_json: conversationEntries.payload_json })
    .from(conversationEntries)
    .where(eq(conversationEntries.conversation_id, conversationId))
    .all();
  return entries.some((entry) => {
    const payload = decodeStoredEntry(entry);
    return (
      "content" in payload &&
      Array.isArray(payload.content) &&
      payload.content.some(
        (block) => isRecord(block) && block.type === "imageRef" && block.fileId === fileId,
      )
    );
  });
}

function toolResultFileId(details: unknown): string | null {
  if (!isRecord(details) || !isRecord(details.file)) return null;
  return typeof details.file.id === "string" ? details.file.id : null;
}

export function listConversationEntries(
  database: Database,
  conversationId: string,
): ConversationEntry[] {
  return database
    .select()
    .from(conversationEntries)
    .where(eq(conversationEntries.conversation_id, conversationId))
    .orderBy(asc(conversationEntries.sequence))
    .all();
}

export async function hydrateConversationEntries(
  database: Database,
  conversationId: string,
  userId: string,
): Promise<Message[]> {
  const messages = (
    await Promise.all(
      listConversationEntries(database, conversationId).map((entry) =>
        hydrateStoredEntry(database, entry, userId),
      ),
    )
  ).filter((message): message is Message => message !== null);
  validateToolResultLinks(messages);
  return messages;
}

export function appendAgentMessage(
  database: Database,
  conversationId: string,
  runId: string,
  message: AssistantMessage | ToolResultMessage,
): ConversationEntry {
  const content = message.content.map((block) => {
    if (block.type !== "image") return block;
    if (message.role !== "toolResult")
      throw new Error("assistant image content must be stored as an owned file reference");
    const fileId = toolResultFileId(message.details);
    if (!fileId) throw new Error("tool result image is missing its file reference");
    const file = database
      .select({ mime: files.mime })
      .from(files)
      .where(eq(files.id, fileId))
      .get();
    if (!file || file.mime !== block.mimeType) throw new Error("tool result image mismatch");
    return { type: "imageRef" as const, fileId, mimeType: file.mime };
  });
  const payload = { ...message, content };
  delete (payload as { timestamp?: number }).timestamp;
  const entry: ConversationEntry = {
    id: crypto.randomUUID(),
    conversation_id: conversationId,
    run_id: runId,
    sequence: 0,
    kind: message.role === "assistant" ? "assistant_message" : "tool_result",
    payload_json: JSON.stringify(payload),
    created_at: new Date(message.timestamp).toISOString(),
  };
  database.transaction((tx) => {
    const currentSequence = tx
      .select({ sequence: max(conversationEntries.sequence) })
      .from(conversationEntries)
      .where(eq(conversationEntries.conversation_id, conversationId))
      .get()?.sequence;
    entry.sequence = (currentSequence ?? 0) + 1;
    tx.insert(conversationEntries).values(entry).run();
  });
  return entry;
}

export function validateToolResultLinks(messages: readonly Message[]): void {
  const pending = new Set<string>();
  for (const message of messages) {
    if (message.role === "assistant")
      for (const block of message.content) if (block.type === "toolCall") pending.add(block.id);
    if (message.role === "toolResult" && !pending.delete(message.toolCallId))
      throw new Error(`orphan tool result: ${message.toolCallId}`);
  }
}
