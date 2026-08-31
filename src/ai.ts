import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  contentText,
  createModels,
  getSupportedThinkingLevels,
  Type,
  type Api,
  type Context,
  type Credential,
  type CredentialInfo,
  type CredentialStore,
  type Model,
  type ModelThinkingLevel,
} from "@earendil-works/pi-ai";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import { config } from "./config";
import { getCodexAccountId } from "./codex-token";
import { COMPACTION_SYSTEM_PROMPT } from "./prompt";
import { parseThinkingClassification } from "./thinking-classifier";

export const AUTO_THINKING_MODEL = "gpt-5.6-luna";
export const DEFAULT_THINKING_LEVEL = "low";
export type ThinkingLevel = "auto" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type ResolvedThinkingLevel = ModelThinkingLevel;
export type AiSettings = { model: string; thinking: ThinkingLevel };
export type ThinkingClassification = {
  thinking: Extract<ThinkingLevel, "minimal" | "low" | "medium" | "high">;
  title: string;
};
export type ThinkingClassifierInput = {
  latestUserText: string;
  recentText: { role: "user" | "assistant"; text: string }[];
  imageCount: number;
  needsTitle: boolean;
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
    thinking: isThinkingLevel(thinking) ? thinking : DEFAULT_THINKING_LEVEL,
  };
}

export function supportedThinkingLevels(model: Model<Api>): ThinkingLevel[] {
  const supported = new Set(getSupportedThinkingLevels(model));
  return (["auto", "minimal", "low", "medium", "high", "xhigh", "max"] as const).filter(
    (level) => level === "auto" || supported.has(level),
  );
}

export function resolveThinkingLevel(
  model: Model<Api>,
  requested: Exclude<ThinkingLevel, "auto">,
): ResolvedThinkingLevel {
  const order: ResolvedThinkingLevel[] = [
    "off",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ];
  const supported = new Set(getSupportedThinkingLevels(model));
  for (let index = order.indexOf(requested); index >= 0; index--)
    if (supported.has(order[index])) return order[index];
  return getSupportedThinkingLevels(model)[0] ?? "off";
}

export async function resolveRunThinking(
  requested: ThinkingLevel,
  model: Model<Api>,
  classify: () => Promise<ThinkingClassification> = () =>
    Promise.reject(new Error("thinking classifier is not configured")),
  needsTitle = false,
): Promise<{ resolved: ResolvedThinkingLevel; title: string }> {
  const fixed = requested === "auto" ? undefined : resolveThinkingLevel(model, requested);
  if (fixed !== undefined && !needsTitle) return { resolved: fixed, title: "" };
  try {
    const result = await classify();
    return {
      resolved: fixed ?? resolveThinkingLevel(model, result.thinking),
      title: result.title,
    };
  } catch {
    return { resolved: fixed ?? resolveThinkingLevel(model, "medium"), title: "" };
  }
}

export async function classifyThinking(
  input: ThinkingClassifierInput,
  signal?: AbortSignal,
): Promise<ThinkingClassification> {
  const model = getModel(AUTO_THINKING_MODEL);
  const context: Context = {
    systemPrompt: `Classify the reasoning effort needed for the next assistant response.
Call submit_classification exactly once. Do not answer the user. Do not decide tools, skills, web search, or image generation.
Use minimal for greetings, simple transformations, and direct replies; low for ordinary questions and short explanations; medium for multi-step analysis, comparison, planning, ambiguity, or image-related reasoning; high for difficult synthesis, high-stakes reasoning, long constrained tasks, or several dependent steps. When uncertain, choose medium.
Set title to a concise 12-20 character title only when needsTitle is true; otherwise use an empty string.`,
    messages: [{ role: "user", content: JSON.stringify(input), timestamp: Date.now() }],
    tools: [
      {
        name: "submit_classification",
        description: "Return the reasoning classification and optional first-turn title.",
        parameters: Type.Object(
          {
            thinking: Type.Union([
              Type.Literal("minimal"),
              Type.Literal("low"),
              Type.Literal("medium"),
              Type.Literal("high"),
            ]),
            title: Type.String({ maxLength: 100 }),
          },
          { additionalProperties: false },
        ),
        constrainedSampling: { type: "json_schema", strict: "prefer" },
      },
    ],
  };
  const timeout = AbortSignal.timeout(10_000);
  const stream = models.stream(model, context, {
    reasoningEffort: "minimal",
    toolChoice: "required",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    timeoutMs: 10_000,
  });
  const response = await stream.result();
  if (response.stopReason === "error" || response.stopReason === "aborted")
    throw new Error(response.errorMessage || "thinking classifier failed");
  const call = response.content.find((block) => block.type === "toolCall");
  if (!call || call.type !== "toolCall" || call.name !== "submit_classification")
    throw new Error("invalid thinking classification");
  return parseThinkingClassification(call.arguments, input.needsTitle);
}

function isThinkingLevel(value: string): value is ThinkingLevel {
  return ["auto", "minimal", "low", "medium", "high", "xhigh", "max"].includes(value);
}

export async function summarizeConversation(payload: string, signal?: AbortSignal) {
  const model = getModel(config.codexModel);
  const stream = models.streamSimple(
    model,
    {
      systemPrompt: COMPACTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: payload, timestamp: Date.now() }],
    },
    {
      reasoning: "low",
      cacheRetention: "none",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(config.aiTimeoutMs)])
        : AbortSignal.timeout(config.aiTimeoutMs),
      timeoutMs: config.aiTimeoutMs,
    },
  );
  const response = await stream.result();
  if (response.stopReason === "error" || response.stopReason === "aborted")
    throw new Error(response.errorMessage || "compaction summary failed");
  return { summary: contentText(response.content).trim(), usage: response.usage };
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
export const streamChat = models.streamSimple.bind(models);
export function getChatModel(modelId: string) {
  return getModel(modelId);
}
function getModel(modelId: string) {
  const model = models.getModel("openai-codex", modelId);
  if (!model) throw new Error(`Unknown OpenAI Codex model: ${modelId}`);
  return model;
}
