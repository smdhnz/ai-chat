import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  contentText,
  createModels,
  type AssistantMessage,
  type Context,
  type Credential,
  type CredentialInfo,
  type CredentialStore,
  type ImageContent,
  type Message,
} from "@earendil-works/pi-ai";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import { config } from "./config";
import { isContextLarge } from "./context";
import { getCodexAccountId } from "./codex-token";

const zeroUsage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

export const TURN_PLAN_MODEL = "gpt-5.6-luna";
export const DEFAULT_THINKING_LEVEL = "low";
export type ThinkingLevel = "low" | "medium" | "high";
export type AiSettings = { model: string; thinking: ThinkingLevel };
type ChatOptions = AiSettings & {
  images?: ImageContent[];
  signal?: AbortSignal;
  sessionId?: string;
  cacheRetention?: "none" | "short";
  onText?: (text: string) => void;
};

export type HistoryEntry = {
  role: "user" | "assistant";
  content: string;
  created_at: string;
  images?: ImageContent[];
};
export type DeviceAuthInfo = {
  userCode: string;
  verificationUri: string;
  expiresInSeconds: number;
};
let activeLogin: Promise<DeviceAuthInfo> | null = null;

export function isAuthenticationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /oauth|authenticat|provider is not configured|credentials?.*(missing|not|invalid)|api key|token.*(expired|refresh|invalid)|unauthorized|HTTP 401/i.test(
    message,
  );
}

export function beginCodexReauthentication(): Promise<DeviceAuthInfo> {
  if (activeLogin) return activeLogin;
  activeLogin = new Promise<DeviceAuthInfo>((resolve, reject) => {
    let announced = false;
    void models
      .login("openai-codex", "oauth", {
        prompt: async (prompt) => (prompt.type === "select" ? "device_code" : ""),
        notify: (event) => {
          if (event.type === "device_code") {
            announced = true;
            resolve({
              userCode: event.userCode,
              verificationUri: event.verificationUri,
              expiresInSeconds: event.expiresInSeconds || 900,
            });
          }
        },
      })
      .catch(reject)
      .finally(() => {
        activeLogin = null;
      });
    setTimeout(() => {
      if (!announced) reject(new Error("再認証コードを取得できませんでした"));
    }, 15_000);
  });
  return activeLogin;
}

export function resolveAiSettings(thinking: string): AiSettings {
  return {
    model: getModel(config.codexModel).id,
    thinking: ["low", "medium", "high"].includes(thinking)
      ? (thinking as ThinkingLevel)
      : DEFAULT_THINKING_LEVEL,
  };
}

export function cacheSessionId(
  conversationId: string,
  model: string,
  purpose: "chat" | "plan" | "image" = "chat",
): string {
  return `${conversationId}:${purpose}:${model}`;
}

export function needsCompaction(inputTokens: number, modelId: string): boolean {
  const model = getModel(modelId);
  return isContextLarge(inputTokens, model.contextWindow, model.maxTokens);
}

export async function compactHistory(
  previousSummary: string,
  history: HistoryEntry[],
  settings: AiSettings,
  signal?: AbortSignal,
): Promise<string> {
  return (
    await chat(
      [
        "Summarize the conversation for another assistant that will continue it.",
        "Preserve decisions, requirements, facts, user preferences, unresolved tasks, and important file or code references.",
        "Be concise. Do not address the user. Return only the summary.",
        previousSummary && `Previous summary:\n${previousSummary}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      history,
      { ...settings, signal, cacheRetention: "none" },
    )
  ).text;
}

export async function chat(
  systemPrompt: string,
  history: HistoryEntry[],
  options: ChatOptions,
): Promise<{ text: string; contextTokens: number }> {
  const model = getModel(options.model);
  const images = options.images ?? [];
  const messages: Message[] = history.map((entry, index) => {
    const attachedImages = entry.images?.length
      ? entry.images
      : index === history.length - 1
        ? images
        : [];
    return entry.role === "user"
      ? {
          role: "user",
          content: attachedImages.length
            ? [{ type: "text", text: entry.content }, ...attachedImages]
            : entry.content,
          timestamp: Date.parse(entry.created_at),
        }
      : ({
          role: "assistant",
          content: [{ type: "text", text: entry.content }],
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage: zeroUsage,
          stopReason: "stop",
          timestamp: Date.parse(entry.created_at),
        } as AssistantMessage);
  });
  const context: Context = { systemPrompt, messages };
  const stream = models.streamSimple(model, context, {
    reasoning: options.thinking,
    sessionId: options.sessionId,
    cacheRetention: options.cacheRetention ?? "short",
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(config.aiTimeoutMs)])
      : AbortSignal.timeout(config.aiTimeoutMs),
  });
  let text = "";
  for await (const event of stream) {
    if (event.type !== "text_delta") continue;
    text += event.delta;
    options.onText?.(text);
  }
  const response = await stream.result();
  if (response.stopReason === "error" || response.stopReason === "aborted") {
    throw new Error(response.errorMessage || "AI request failed");
  }
  return {
    text: contentText(response.content).trim(),
    contextTokens:
      response.usage.totalTokens ||
      response.usage.input +
        response.usage.output +
        response.usage.cacheRead +
        response.usage.cacheWrite,
  };
}

export async function generateImage(
  prompt: string,
  inputPaths: string[] = [],
  signal?: AbortSignal,
): Promise<Buffer> {
  const auth = await models.getAuth("openai-codex");
  const token = auth?.auth.apiKey;
  if (!token) throw new Error("OpenAI Codex authentication is not configured");
  const requestId = crypto.randomUUID();
  const body: Record<string, unknown> = {
    prompt,
    background: "auto",
    model: "gpt-image-2",
    quality: "auto",
    size: "auto",
  };
  if (inputPaths.length) {
    body.images = await Promise.all(
      inputPaths.slice(0, 5).map(async (path) => ({
        image_url: `data:${mime(path)};base64,${Buffer.from(await readFile(path)).toString("base64")}`,
      })),
    );
  }
  const response = await fetch(
    `https://chatgpt.com/backend-api/codex/images/${inputPaths.length ? "edits" : "generations"}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "chatgpt-account-id": getCodexAccountId(token),
        "content-type": "application/json",
        originator: "ai-chat",
        "x-codex-image-turn-id": requestId,
        "x-client-request-id": requestId,
      },
      body: JSON.stringify(body),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(config.aiTimeoutMs)])
        : AbortSignal.timeout(config.aiTimeoutMs),
    },
  );
  if (!response.ok)
    throw new Error(`画像生成API: HTTP ${response.status} ${await response.text()}`);
  const data = (await response.json()) as { data?: { b64_json?: string }[] };
  if (!data.data?.[0]?.b64_json) throw new Error("画像生成APIから画像が返されませんでした");
  return Buffer.from(data.data[0].b64_json, "base64");
}

function mime(path: string): string {
  if (/\.webp$/i.test(path)) return "image/webp";
  if (/\.gif$/i.test(path)) return "image/gif";
  return /\.jpe?g$/i.test(path) ? "image/jpeg" : "image/png";
}

class JsonCredentialStore implements CredentialStore {
  private chain = Promise.resolve();
  constructor(private path: string) {}
  async read(providerId: string): Promise<Credential | undefined> {
    return (await this.all())[providerId];
  }
  async list(): Promise<readonly CredentialInfo[]> {
    return Object.entries(await this.all()).map(([providerId, credential]) => ({
      providerId,
      type: credential.type,
    }));
  }
  async modify(
    providerId: string,
    fn: (value: Credential | undefined) => Promise<Credential | undefined>,
  ): Promise<Credential | undefined> {
    let result: Credential | undefined;
    this.chain = this.chain
      .catch(() => undefined)
      .then(async () => {
        const all = await this.all();
        result = await fn(all[providerId]);
        if (result) all[providerId] = result;
        await mkdir(dirname(this.path), { recursive: true });
        const temporary = `${this.path}.${process.pid}.tmp`;
        await writeFile(temporary, `${JSON.stringify(all, null, 2)}\n`, {
          mode: 0o600,
        });
        await rename(temporary, this.path);
      });
    await this.chain;
    return result;
  }
  async delete(providerId: string): Promise<void> {
    this.chain = this.chain
      .catch(() => undefined)
      .then(async () => {
        const all = await this.all();
        delete all[providerId];
        await mkdir(dirname(this.path), { recursive: true });
        const temporary = `${this.path}.${process.pid}.tmp`;
        await writeFile(temporary, `${JSON.stringify(all, null, 2)}\n`, {
          mode: 0o600,
        });
        await rename(temporary, this.path);
      });
    await this.chain;
  }
  private async all(): Promise<Record<string, Credential>> {
    try {
      return JSON.parse(await readFile(this.path, "utf8"));
    } catch {
      return {};
    }
  }
}

const authPath = process.env.PI_AUTH_PATH || join(config.dataDir, "auth.json");
const models = createModels({ credentials: new JsonCredentialStore(authPath) });
models.setProvider(openaiCodexProvider());
function getModel(modelId: string) {
  const model = models.getModel("openai-codex", modelId);
  if (!model) throw new Error(`Unknown OpenAI Codex model: ${modelId}`);
  return model;
}
