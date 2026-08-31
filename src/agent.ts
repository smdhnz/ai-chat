import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "./database";
import {
  Agent,
  type AgentEvent,
  type AgentMessage,
  type AgentTool,
  type StreamFn,
} from "@earendil-works/pi-agent-core";
import {
  createAssistantMessageEventStream,
  isContextOverflow,
  type Api,
  type AssistantMessage,
  type AssistantMessageEvent,
  type AssistantMessageEventStream,
  type Context,
  type Message,
  type Model,
  type SimpleStreamOptions,
  type ToolResultMessage,
  type ModelThinkingLevel,
  type ThinkingContent,
} from "@earendil-works/pi-ai";
import { appendAgentMessage, type ConversationEntry } from "./agent-messages";
import type { ToolContext } from "./agent-tools";
import { conversationEntries, conversations, runs } from "./schema";
import {
  compactConversation,
  CompactionCheckpointError,
  estimateActiveContext,
  hydrateActiveContext,
  shouldCompact,
  type SummarizeConversation,
} from "./context";

export type RunStatus = "queued" | "running" | "completed" | "stopped" | "failed";
export type ChatEvent =
  | { type: "run.status"; status: RunStatus }
  | { type: "turn.start"; turn: number }
  | { type: "assistant.text.delta"; contentIndex: number; delta: string }
  | { type: "assistant.reasoning.delta"; contentIndex: number; delta: string }
  | { type: "assistant.tool_call.start"; contentIndex: number; id: string; name: string }
  | { type: "assistant.tool_call.delta"; contentIndex: number; delta: string }
  | { type: "tool.start"; id: string; name: string; args: unknown }
  | { type: "tool.update"; id: string; name: string; summary: string }
  | { type: "tool.end"; id: string; name: string; isError: boolean; result: unknown }
  | { type: "message.final"; entry: PublicFinalEntry }
  | { type: "compaction.start" }
  | { type: "compaction.end"; tokensBefore: number }
  | { type: "run.error"; message: string }
  | { type: "run.done" };

export type ChatEventEnvelope = {
  version: 1;
  conversationId: string;
  runId: string;
  seq: number;
  timestamp: string;
  event: ChatEvent;
};

type PublicFinalEntry = {
  id: string;
  role: "assistant" | "toolResult";
  content: string;
  created_at: string;
};

type StartInput = {
  conversationId: string;
  userId: string;
  userEntryId: string;
  systemPrompt: string;
  requestedThinking: string;
  resolvedThinking: ModelThinkingLevel;
};

type ActiveRun = {
  runId: string;
  userId: string;
  agent: Agent;
  stopRequested: boolean;
  timedOut: boolean;
  settlement: Promise<void>;
};

type RunnerOptions = {
  database: Database;
  model: Model<Api>;
  streamFn: StreamFn;
  timeoutMs: number;
  maxProviderTurns?: number;
  tools?: (context: ToolContext) => AgentTool[];
  summarize?: SummarizeConversation;
  reserveTokens?: number;
  keepRecentTokens?: number;
  publish?: (userId: string, envelope: ChatEventEnvelope) => void;
  now?: () => string;
  id?: () => string;
};

export class ConversationRunner {
  private readonly active = new Map<string, ActiveRun>();
  private readonly maxProviderTurns: number;
  private readonly now: () => string;
  private readonly id: () => string;

  constructor(private readonly options: RunnerOptions) {
    this.maxProviderTurns = options.maxProviderTurns ?? 12;
    this.now = options.now ?? (() => new Date().toISOString());
    this.id = options.id ?? (() => crypto.randomUUID());
  }

  async start(input: StartInput): Promise<string> {
    if (this.active.has(input.conversationId)) throw new Error("conversation already running");
    const runId = this.id();
    const createdAt = this.now();
    this.options.database.transaction((tx) => {
      const owner = tx
        .select({ id: conversationEntries.id })
        .from(conversationEntries)
        .innerJoin(conversations, eq(conversations.id, conversationEntries.conversation_id))
        .where(
          and(
            eq(conversationEntries.id, input.userEntryId),
            eq(conversationEntries.conversation_id, input.conversationId),
            eq(conversationEntries.kind, "user_message"),
            eq(conversations.user_id, input.userId),
          ),
        )
        .get();
      if (!owner) throw new Error("user entry not found");
      const running = tx
        .select({ id: runs.id })
        .from(runs)
        .where(
          and(
            eq(runs.conversation_id, input.conversationId),
            inArray(runs.status, ["queued", "running"]),
          ),
        )
        .get();
      if (running) throw new Error("conversation already running");
      tx.insert(runs)
        .values({
          id: runId,
          conversation_id: input.conversationId,
          user_entry_id: input.userEntryId,
          status: "queued",
          model: this.options.model.id,
          requested_thinking: input.requestedThinking,
          resolved_thinking: input.resolvedThinking,
          created_at: createdAt,
        })
        .run();
    });

    try {
      let providerTurns = 0;
      let eventSeq = 0;
      let persistenceError: Error | undefined;
      const publish = (event: ChatEvent) =>
        this.options.publish?.(input.userId, {
          version: 1,
          conversationId: input.conversationId,
          runId,
          seq: ++eventSeq,
          timestamp: this.now(),
          event,
        });
      const tools =
        this.options.tools?.({
          userId: input.userId,
          conversationId: input.conversationId,
          runId,
        }) ?? [];
      const compact = async (force: boolean, signal?: AbortSignal) => {
        const original = await hydrateActiveContext(
          this.options.database,
          input.conversationId,
          input.userId,
        );
        const originalTokens = estimateActiveContext({
          systemPrompt: input.systemPrompt,
          messages: original.messages,
          tools,
        });
        if (
          !force &&
          !shouldCompact(
            originalTokens,
            this.options.model.contextWindow,
            this.options.reserveTokens,
          )
        )
          return original.messages;
        publish({ type: "compaction.start" });
        try {
          const result = await compactConversation({
            database: this.options.database,
            conversationId: input.conversationId,
            userId: input.userId,
            runId,
            systemPrompt: input.systemPrompt,
            tools,
            contextWindow: this.options.model.contextWindow,
            summarize:
              this.options.summarize ??
              (() => Promise.reject(new Error("compaction summary is not configured"))),
            signal,
            force,
            reserveTokens: this.options.reserveTokens,
            keepRecentTokens: this.options.keepRecentTokens,
            now: this.now,
            id: this.id,
          });
          if (result.compacted)
            publish({ type: "compaction.end", tokensBefore: result.tokensBefore });
          return result.messages;
        } catch (error) {
          if (
            !force &&
            !(error instanceof CompactionCheckpointError) &&
            originalTokens <= this.options.model.contextWindow
          )
            return original.messages;
          throw error;
        }
      };
      const messages = await compact(false);
      if (messages.at(-1)?.role !== "user")
        throw new Error("latest transcript entry is not a user message");
      const streamFn: StreamFn = (model, context, options = {}) =>
        streamWithOverflowRecovery(
          model,
          context,
          this.providerOptions(options),
          this.options.streamFn,
          (signal) => compact(true, signal),
        );
      const agent = new Agent({
        streamFn,
        sessionId: `chat:${input.userId}:${input.conversationId}:${this.options.model.id}`,
        initialState: {
          systemPrompt: input.systemPrompt,
          model: this.options.model,
          thinkingLevel: input.resolvedThinking,
          tools,
          messages,
        },
        toolExecution: "sequential",
        shouldStopAfterTurn: () => providerTurns >= this.maxProviderTurns,
        prepareNextTurnWithContext: async (turn, signal) => {
          const replacement = await compact(false, signal);
          return replacement === turn.context.messages
            ? undefined
            : { context: { ...turn.context, messages: replacement } };
        },
      });
      const active: ActiveRun = {
        runId,
        userId: input.userId,
        agent,
        stopRequested: false,
        timedOut: false,
        settlement: Promise.resolve(),
      };
      agent.subscribe(async (event) => {
        try {
          if (event.type === "turn_start") providerTurns += 1;
          await this.persistAndPublishEvent(
            input.conversationId,
            runId,
            event,
            providerTurns,
            publish,
          );
        } catch (error) {
          persistenceError = error instanceof Error ? error : new Error(String(error));
          throw error;
        }
      });
      this.options.database.transaction((tx) => {
        tx.update(runs)
          .set({ status: "running", started_at: this.now() })
          .where(eq(runs.id, runId))
          .run();
        tx.update(conversations)
          .set({ generation_status: "running", unread: 0, updated_at: this.now() })
          .where(eq(conversations.id, input.conversationId))
          .run();
      });
      publish({ type: "run.status", status: "running" });
      active.settlement = this.execute(
        input.conversationId,
        active,
        () => persistenceError,
        publish,
      );
      this.active.set(input.conversationId, active);
      void active.settlement;
      return runId;
    } catch (error) {
      this.finishRun(input.conversationId, runId, "failed", errorMessage(error));
      throw error;
    }
  }

  async stop(conversationId: string, userId: string): Promise<boolean> {
    const active = this.active.get(conversationId);
    if (!active || active.userId !== userId) return false;
    active.stopRequested = true;
    active.agent.abort();
    await active.settlement;
    return true;
  }

  async waitForIdle(conversationId: string): Promise<void> {
    await this.active.get(conversationId)?.settlement;
  }

  private async execute(
    conversationId: string,
    active: ActiveRun,
    getPersistenceError: () => Error | undefined,
    publish: (event: ChatEvent) => void,
  ): Promise<void> {
    const timer = setTimeout(() => {
      active.timedOut = true;
      active.agent.abort();
    }, this.options.timeoutMs);
    timer.unref?.();
    try {
      await active.agent.continue();
    } finally {
      clearTimeout(timer);
      const failure = getPersistenceError();
      const last = [...active.agent.state.messages]
        .reverse()
        .find((message): message is AssistantMessage => message.role === "assistant");
      const status: RunStatus =
        failure || active.timedOut || last?.stopReason === "error"
          ? "failed"
          : active.stopRequested || last?.stopReason === "aborted"
            ? "stopped"
            : "completed";
      const message = failure
        ? `transcript persistence failed: ${failure.message}`
        : active.timedOut
          ? "AI request timed out"
          : last?.errorMessage;
      this.finishRun(conversationId, active.runId, status, message);
      publish({ type: "run.status", status });
      if (status === "failed") publish({ type: "run.error", message: publicError(message) });
      publish({ type: "run.done" });
      if (this.active.get(conversationId) === active) this.active.delete(conversationId);
    }
  }

  private async persistAndPublishEvent(
    conversationId: string,
    runId: string,
    event: AgentEvent,
    turn: number,
    publish: (event: ChatEvent) => void,
  ): Promise<void> {
    if (event.type === "turn_start") {
      this.options.database.update(runs).set({ turn_count: turn }).where(eq(runs.id, runId)).run();
      publish({ type: "turn.start", turn });
      return;
    }
    if (event.type === "message_update") {
      const update = event.assistantMessageEvent;
      if (update.type === "text_delta")
        publish({
          type: "assistant.text.delta",
          contentIndex: update.contentIndex,
          delta: update.delta,
        });
      else if (update.type === "thinking_delta") {
        const block = update.partial.content[update.contentIndex];
        if (block?.type !== "thinking" || !block.redacted)
          publish({
            type: "assistant.reasoning.delta",
            contentIndex: update.contentIndex,
            delta: update.delta,
          });
      } else if (update.type === "thinking_end") {
        const block = update.partial.content[update.contentIndex];
        if (block?.type === "thinking" && block.redacted)
          publish({
            type: "assistant.reasoning.delta",
            contentIndex: update.contentIndex,
            delta: publicReasoning(block),
          });
      } else if (update.type === "toolcall_start") {
        const call = update.partial.content[update.contentIndex];
        if (call?.type === "toolCall")
          publish({
            type: "assistant.tool_call.start",
            contentIndex: update.contentIndex,
            id: call.id,
            name: call.name,
          });
      } else if (update.type === "toolcall_delta")
        publish({
          type: "assistant.tool_call.delta",
          contentIndex: update.contentIndex,
          delta: update.delta,
        });
      return;
    }
    if (event.type === "message_end" && isPersistedMessage(event.message)) {
      const message = safeFinalMessage(event.message);
      if (message.role === "assistant" && !hasPersistableAssistantContent(message)) return;
      const entry = appendAgentMessage(this.options.database, conversationId, runId, message);
      if (message.role === "assistant")
        this.options.database
          .update(runs)
          .set({ context_tokens: totalTokens(message) })
          .where(eq(runs.id, runId))
          .run();
      publish({ type: "message.final", entry: publicEntry(entry, message) });
      return;
    }
    if (event.type === "tool_execution_start")
      publish({
        type: "tool.start",
        id: event.toolCallId,
        name: event.toolName,
        args: publicToolArgs(event.toolName, event.args),
      });
    else if (event.type === "tool_execution_update")
      publish({
        type: "tool.update",
        id: event.toolCallId,
        name: event.toolName,
        summary: "updated",
      });
    else if (event.type === "tool_execution_end")
      publish({
        type: "tool.end",
        id: event.toolCallId,
        name: event.toolName,
        isError: event.isError,
        result: publicToolResult(event.toolName, event.result, event.isError),
      });
  }

  private providerOptions(options: SimpleStreamOptions): SimpleStreamOptions {
    return { ...options, timeoutMs: this.options.timeoutMs };
  }

  private finishRun(
    conversationId: string,
    runId: string,
    status: RunStatus,
    error?: string,
  ): void {
    const timestamp = this.now();
    this.options.database.transaction((tx) => {
      tx.update(runs)
        .set({ status, error: error ?? null, finished_at: timestamp })
        .where(eq(runs.id, runId))
        .run();
      tx.update(conversations)
        .set({
          generation_status: status === "stopped" ? "stopped" : "idle",
          unread: 1,
          updated_at: timestamp,
        })
        .where(eq(conversations.id, conversationId))
        .run();
    });
  }
}

function streamWithOverflowRecovery(
  model: Model<Api>,
  context: Context,
  options: SimpleStreamOptions,
  streamFn: StreamFn,
  recover: (signal?: AbortSignal) => Promise<Message[]>,
): AssistantMessageEventStream {
  const output = createAssistantMessageEventStream();
  const forward = async (nextContext: Context, retried: boolean): Promise<void> => {
    try {
      const source = await streamFn(model, nextContext, options);
      let pendingStart: AssistantMessageEvent | undefined;
      for await (const event of source) {
        if (event.type === "start") {
          pendingStart = event;
          continue;
        }
        if (event.type === "error" || (event.type === "done" && pendingStart)) {
          const message = await source.result();
          if (!retried && isContextOverflow(message, model.contextWindow)) {
            try {
              const messages = await recover(options.signal);
              await forward({ ...nextContext, messages }, true);
            } catch (error) {
              const failed = {
                ...message,
                stopReason: "error" as const,
                errorMessage: `context overflow recovery failed: ${errorMessage(error)}`,
              };
              output.push({ type: "start", partial: failed });
              output.push({ type: "error", reason: "error", error: failed });
            }
            return;
          }
        }
        if (pendingStart) {
          output.push(pendingStart);
          pendingStart = undefined;
        }
        output.push(event);
      }
    } catch (error) {
      const failed: AssistantMessage = {
        role: "assistant",
        content: [{ type: "text", text: "" }],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: zeroUsage,
        stopReason: "error",
        errorMessage: errorMessage(error),
        timestamp: Date.now(),
      };
      output.push({ type: "start", partial: failed });
      output.push({ type: "error", reason: "error", error: failed });
    }
  };
  void forward(context, false);
  return output;
}

function isPersistedMessage(
  message: AgentMessage,
): message is AssistantMessage | ToolResultMessage {
  return message.role === "assistant" || message.role === "toolResult";
}

function safeFinalMessage(
  message: AssistantMessage | ToolResultMessage,
): AssistantMessage | ToolResultMessage {
  return message.role === "assistant" &&
    (message.stopReason === "aborted" || message.stopReason === "error")
    ? { ...message, content: message.content.filter((block) => block.type !== "toolCall") }
    : message;
}

function hasPersistableAssistantContent(message: AssistantMessage): boolean {
  return message.content.some(
    (block) =>
      block.type === "toolCall" ||
      (block.type === "text" && block.text.length > 0) ||
      (block.type === "thinking" && block.thinking.length > 0),
  );
}

function totalTokens(message: AssistantMessage): number {
  return (
    message.usage.totalTokens ||
    message.usage.input + message.usage.output + message.usage.cacheRead + message.usage.cacheWrite
  );
}

export function publicReasoning(block: ThinkingContent): string {
  return block.redacted ? "推論内容は非公開" : block.thinking;
}

function publicEntry(
  entry: ConversationEntry,
  message: AssistantMessage | ToolResultMessage,
): PublicFinalEntry {
  return {
    id: entry.id,
    role: message.role,
    content:
      message.role === "toolResult"
        ? ""
        : message.content
            .filter(
              (block): block is Extract<(typeof message.content)[number], { type: "text" }> =>
                block.type === "text",
            )
            .map((block) => block.text)
            .join(""),
    created_at: entry.created_at,
  };
}

function publicToolArgs(name: string, args: unknown): unknown {
  if (!isRecord(args)) return {};
  if (name === "web_search")
    return { query: text(args.query, 500), maxResults: number(args.maxResults) };
  if (name === "load_skill") return { name: text(args.name, 80) };
  if (name === "generate_image")
    return {
      prompt: text(args.prompt, 2_000),
      inputFileIds: stringArray(args.inputFileIds, 5),
    };
  if (name === "inspect_image") return { fileId: text(args.fileId, 200) };
  return {};
}

function publicToolResult(name: string, result: unknown, isError: boolean): unknown {
  if (isError) return { error: "Tool execution failed" };
  if (!isRecord(result) || !isRecord(result.details)) return {};
  const details = result.details;
  if (name === "web_search")
    return {
      query: text(details.query, 500),
      sources: Array.isArray(details.sources)
        ? details.sources
            .slice(0, 8)
            .flatMap((source) =>
              isRecord(source) && typeof source.url === "string"
                ? [{ title: text(source.title, 300), url: source.url.slice(0, 2_000) }]
                : [],
            )
        : [],
    };
  if (name === "load_skill")
    return {
      name: text(details.name, 80),
      source: details.source === "builtin" ? "builtin" : "user",
      alreadyLoaded: details.alreadyLoaded === true,
    };
  if (name === "generate_image" || name === "inspect_image")
    return {
      ...(name === "generate_image" &&
      (details.operation === "edit" || details.operation === "generation")
        ? { operation: details.operation }
        : {}),
      file: publicFile(details.file),
    };
  return {};
}

function publicFile(value: unknown): unknown {
  if (!isRecord(value)) return undefined;
  return {
    id: text(value.id, 200),
    name: text(value.name, 255),
    mime: text(value.mime, 100),
    size: number(value.size),
    source: text(value.source, 50),
    created_at: text(value.created_at, 50),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, limit: number): string {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown, limit: number): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, limit)
    : [];
}

const zeroUsage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function publicError(message?: string): string {
  if (!message) return "AI request failed";
  return /auth|oauth|credential|token|401/i.test(message)
    ? "OpenAI Codex authentication is required"
    : "AI request failed";
}
