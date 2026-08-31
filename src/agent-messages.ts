import type { Database } from "bun:sqlite";
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
  | { type: "skill"; name: string; status: ActivityStatus }
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
  | { type: "tool"; name: string; summary: string; status: ActivityStatus };

export type PublicTranscriptMessage = {
  id: string;
  runId?: string;
  role: "user" | "assistant";
  content: string;
  fileIds: string[];
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
  if (call.name === "load_skill")
    return {
      type: "skill",
      name: typeof details.name === "string" ? details.name.slice(0, 80) : "不明なスキル",
      status,
    };
  if (call.name === "web_search")
    return {
      type: "web_search",
      query: typeof details.query === "string" ? details.query.slice(0, 500) : "",
      sources: [],
      status,
    };
  if (call.name === "generate_image") return { type: "image_generation", status };
  return {
    type: "tool",
    name: call.name.slice(0, 100),
    summary: status === "running" ? "処理中" : "処理が完了しませんでした",
    status,
  };
}

function publicToolActivity(result: ToolResultPayload): PublicActivity {
  const status = result.isError ? "error" : "completed";
  const details = isRecord(result.details) ? result.details : {};
  if (result.toolName === "load_skill")
    return {
      type: "skill",
      name: typeof details.name === "string" ? details.name.slice(0, 80) : "不明なスキル",
      status,
    };
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
  return (
    database
      .query(
        `SELECT id,conversation_id,run_id,sequence,kind,payload_json,created_at
         FROM conversation_entries WHERE conversation_id=?
         AND kind IN ('user_message','assistant_message') ORDER BY sequence`,
      )
      .all(conversationId) as ConversationEntry[]
  ).map((entry) => projectLegacyMessage(entry)!);
}

export function pageLegacyMessages(
  database: Database,
  conversationId: string,
  before: string | null,
  limit: number,
): { messages: LegacyMessageRow[]; hasMore: boolean } {
  const cursor = before
    ? (database
        .query("SELECT sequence FROM conversation_entries WHERE id=? AND conversation_id=?")
        .get(before, conversationId) as { sequence: number } | null)
    : null;
  if (before && !cursor) throw new Error("invalid cursor");
  const rows = database
    .query(
      `SELECT id,conversation_id,run_id,sequence,kind,payload_json,created_at
       FROM conversation_entries WHERE conversation_id=?
       AND kind IN ('user_message','assistant_message') ${cursor ? "AND sequence < ?" : ""}
       ORDER BY sequence DESC LIMIT ${limit + 1}`,
    )
    .all(...(cursor ? [conversationId, cursor.sequence] : [conversationId])) as ConversationEntry[];
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
  const runs = new Map(
    (
      database
        .query("SELECT id,status,error FROM runs WHERE conversation_id=?")
        .all(conversationId) as { id: string; status: string; error: string | null }[]
    ).map((run) => [run.id, run]),
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
          const runStatus = entry.run_id ? runs.get(entry.run_id)?.status : undefined;
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
      call.group.activities[call.activityIndex] = publicToolActivity(result);
      toolCalls.delete(`${entry.run_id}:${result.toolCallId}`);
    } else group.activities.push(publicToolActivity(result));
    if (
      result.toolName === "load_skill" &&
      !result.isError &&
      isRecord(result.details) &&
      typeof result.details.name === "string"
    )
      group.skills.push(result.details.name);
  }
  for (const message of messages) {
    message.fileIds = [...new Set(message.fileIds)];
    message.skills = [...new Set(message.skills)];
    const run = message.runId ? runs.get(message.runId) : undefined;
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
    createdAt: string;
    model?: string;
    runId?: string;
  },
): void {
  const content: StoredContent[] = [
    ...(message.content ? [{ type: "text" as const, text: message.content }] : []),
    ...(message.fileIds ?? []).map((fileId) => {
      const file = database.query("SELECT mime FROM files WHERE id=?").get(fileId) as {
        mime: string;
      } | null;
      if (!file) throw new Error(`missing transcript file: ${fileId}`);
      return { type: "imageRef" as const, fileId, mimeType: file.mime };
    }),
  ];
  const payload: UserPayload | AssistantPayload =
    message.role === "user"
      ? {
          role: "user",
          content,
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
  const sequence = (
    database
      .query(
        "SELECT COALESCE(MAX(sequence),0)+1 AS sequence FROM conversation_entries WHERE conversation_id=?",
      )
      .get(message.conversationId) as { sequence: number }
  ).sequence;
  database
    .query(
      `INSERT INTO conversation_entries(id,conversation_id,run_id,sequence,kind,payload_json,created_at)
       VALUES(?,?,?,?,?,?,?)`,
    )
    .run(
      message.id,
      message.conversationId,
      message.runId ?? null,
      sequence,
      `${message.role}_message`,
      JSON.stringify(payload),
      message.createdAt,
    );
}

export function updateAttachmentContext(
  database: Database,
  entryId: string,
  attachmentContext: string,
): void {
  const entry = database
    .query("SELECT kind,payload_json FROM conversation_entries WHERE id=?")
    .get(entryId) as Pick<ConversationEntry, "kind" | "payload_json"> | null;
  if (!entry || entry.kind !== "user_message") throw new Error("user message not found");
  const payload = decodeStoredEntry(entry) as UserPayload;
  payload.attachmentContext = attachmentContext;
  database
    .query("UPDATE conversation_entries SET payload_json=? WHERE id=?")
    .run(JSON.stringify(payload), entryId);
}

export function rewindConversation(
  database: Database,
  conversationId: string,
  userId: string,
  entryId: string,
  content: string,
): void {
  const entry = database
    .query(
      `SELECT e.sequence,e.kind,e.payload_json FROM conversation_entries e
       JOIN conversations c ON c.id=e.conversation_id
       WHERE e.id=? AND e.conversation_id=? AND c.user_id=?`,
    )
    .get(entryId, conversationId, userId) as Pick<
    ConversationEntry,
    "sequence" | "kind" | "payload_json"
  > | null;
  if (!entry || entry.kind !== "user_message") throw new Error("user message not found");
  const payload = decodeStoredEntry(entry) as UserPayload;
  const firstText = payload.content.findIndex((block) => block.type === "text");
  if (firstText < 0) payload.content.unshift({ type: "text", text: content });
  else payload.content[firstText] = { ...payload.content[firstText], type: "text", text: content };

  const runIds = (
    database
      .query(
        `SELECT r.id FROM runs r JOIN conversation_entries e ON e.id=r.user_entry_id
         WHERE r.conversation_id=? AND e.sequence>=?`,
      )
      .all(conversationId, entry.sequence) as { id: string }[]
  ).map((run) => run.id);
  database
    .query("DELETE FROM conversation_entries WHERE conversation_id=? AND sequence>?")
    .run(conversationId, entry.sequence);
  if (runIds.length)
    database
      .query(`DELETE FROM runs WHERE id IN (${runIds.map(() => "?").join(",")})`)
      .run(...runIds);
  database
    .query("UPDATE conversation_entries SET payload_json=? WHERE id=?")
    .run(JSON.stringify(payload), entryId);

  const checkpoint = database
    .query(
      `SELECT kind,payload_json FROM conversation_entries
       WHERE conversation_id=? AND kind='compaction' ORDER BY sequence DESC LIMIT 1`,
    )
    .get(conversationId) as Pick<ConversationEntry, "kind" | "payload_json"> | null;
  const compacted = checkpoint ? (decodeStoredEntry(checkpoint) as CompactionPayload) : null;
  database
    .query(
      `UPDATE conversations SET context_summary=?,compacted_through_id=?,context_tokens=?,unread=0
       WHERE id=? AND user_id=?`,
    )
    .run(
      compacted?.summary ?? "",
      compacted?.compactedThroughId ?? null,
      compacted?.tokensBefore ?? 0,
      conversationId,
      userId,
    );
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
  userId: string,
): Promise<Message | null> {
  if (!new Set(["user_message", "assistant_message", "tool_result"]).has(entry.kind)) return null;
  const owned = database
    .query(`SELECT 1 FROM conversations WHERE id=? AND user_id=?`)
    .get(entry.conversation_id, userId);
  if (!owned) throw new Error("conversation transcript ownership mismatch");
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
      .query("SELECT path,mime FROM files WHERE id=? AND user_id=?")
      .get(block.fileId, userId) as { path: string; mime: string } | null;
    if (
      !file ||
      file.mime !== block.mimeType ||
      !isConversationFile(database, entry.conversation_id, block.fileId)
    )
      throw new Error("conversation transcript image ownership mismatch");
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
    .query("SELECT kind,payload_json FROM conversation_entries WHERE conversation_id=?")
    .all(conversationId) as Pick<ConversationEntry, "kind" | "payload_json">[];
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
    .query(
      `SELECT id,conversation_id,run_id,sequence,kind,payload_json,created_at
       FROM conversation_entries WHERE conversation_id=? ORDER BY sequence`,
    )
    .all(conversationId) as ConversationEntry[];
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
      .query(
        `SELECT f.mime FROM files f JOIN conversations c ON c.user_id=f.user_id
         WHERE f.id=? AND c.id=?`,
      )
      .get(fileId, conversationId) as { mime: string } | null;
    if (!file || file.mime !== block.mimeType)
      throw new Error("tool result image ownership mismatch");
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
  database.transaction(() => {
    entry.sequence = (
      database
        .query(
          "SELECT COALESCE(MAX(sequence),0)+1 AS sequence FROM conversation_entries WHERE conversation_id=?",
        )
        .get(conversationId) as { sequence: number }
    ).sequence;
    database
      .query(
        `INSERT INTO conversation_entries(id,conversation_id,run_id,sequence,kind,payload_json,created_at)
         VALUES(?,?,?,?,?,?,?)`,
      )
      .run(
        entry.id,
        entry.conversation_id,
        entry.run_id,
        entry.sequence,
        entry.kind,
        entry.payload_json,
        entry.created_at,
      );
  })();
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

export function migrateCanonicalTranscript(database: Database, model: string): void {
  database.transaction(() => {
    const conversations = database
      .query(
        "SELECT id,context_summary,compacted_through_id FROM conversations ORDER BY created_at,id",
      )
      .all() as { id: string; context_summary: string; compacted_through_id: string | null }[];
    for (const conversation of conversations) {
      const existing = database
        .query("SELECT COUNT(*) AS count FROM conversation_entries WHERE conversation_id=?")
        .get(conversation.id) as { count: number };
      if (existing.count) continue;
      let sequence = 0;
      if (conversation.context_summary) {
        database
          .query(
            `INSERT INTO conversation_entries(id,conversation_id,sequence,kind,payload_json,created_at)
             VALUES(?,?,?,?,?,?)`,
          )
          .run(
            crypto.randomUUID(),
            conversation.id,
            sequence++,
            "compaction",
            JSON.stringify({
              summary: conversation.context_summary,
              compactedThroughId: conversation.compacted_through_id ?? undefined,
            }),
            new Date(0).toISOString(),
          );
      }
      const messages = database
        .query(
          `SELECT id,role,content,file_ids,skills,attachment_context,created_at FROM messages
           WHERE conversation_id=? ORDER BY created_at,id`,
        )
        .all(conversation.id) as LegacyMessageRow[];
      for (const message of messages) {
        const fileIds = JSON.parse(message.file_ids) as string[];
        appendLegacyMessageAtSequence(database, {
          id: message.id,
          role: message.role,
          content: message.content,
          attachment_context: message.attachment_context,
          created_at: message.created_at,
          conversationId: conversation.id,
          fileIds,
          skills: JSON.parse(message.skills) as string[],
          sequence: sequence++,
          model,
        });
      }
    }
  })();
}

function appendLegacyMessageAtSequence(
  database: Database,
  message: Omit<LegacyMessageRow, "file_ids" | "skills"> & {
    conversationId: string;
    fileIds: string[];
    skills: string[];
    sequence: number;
    model: string;
  },
): void {
  const content: StoredContent[] = [
    ...(message.content ? [{ type: "text" as const, text: message.content }] : []),
    ...message.fileIds.map((fileId) => {
      const file = database.query("SELECT mime FROM files WHERE id=?").get(fileId) as {
        mime: string;
      } | null;
      if (!file) throw new Error(`missing transcript file: ${fileId}`);
      return { type: "imageRef" as const, fileId, mimeType: file.mime };
    }),
  ];
  const payload: UserPayload | AssistantPayload =
    message.role === "user"
      ? {
          role: "user",
          content,
          attachmentContext: message.attachment_context,
          skills: message.skills,
        }
      : {
          role: "assistant",
          content,
          api: "openai-responses",
          provider: "openai-codex",
          model: message.model,
          usage: zeroUsage,
          stopReason: "stop",
          skills: message.skills,
        };
  database
    .query(
      `INSERT INTO conversation_entries(id,conversation_id,sequence,kind,payload_json,created_at)
       VALUES(?,?,?,?,?,?)`,
    )
    .run(
      message.id,
      message.conversationId,
      message.sequence,
      `${message.role}_message`,
      JSON.stringify(payload),
      message.created_at,
    );
}
