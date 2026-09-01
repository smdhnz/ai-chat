export type FileItem = {
  id: string;
  name: string;
  mime: string;
  size: number;
  source: string;
  created_at: string;
  preview?: string;
};
export type UserSummary = {
  id: string;
  username: string;
  display_name: string;
  avatar: string | null;
};
export type Project = {
  id: string;
  user_id: string;
  name: string;
  system_prompt: string;
  language: string;
  thinking_level: ThinkingLevel;
  owner: UserSummary;
  members: UserSummary[];
  pending_invitations: UserSummary[];
  is_owner: boolean;
  shared: boolean;
  created_at: string;
  updated_at: string;
};
export type ProjectInvitation = {
  project_id: string;
  project_name: string;
  owner: UserSummary;
};
export type ActivityStatus = "running" | "completed" | "error";
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
  | { type: "tool"; name: string; summary: string; status: ActivityStatus };

export type Conversation = {
  id: string;
  project_id: string | null;
  title: string;
  temporary: number;
  generation_status: "idle" | "running" | "stopped";
  unread: number;
  created_at: string;
  updated_at: string;
  activeRunId?: string | null;
};
export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  files: FileItem[];
  author?: UserSummary | null;
  created_at: string;
  activities?: PublicActivity[];
  status?: "completed" | "stopped" | "failed";
  runId?: string;
  auth?: DeviceAuth;
};
export type MessagePage = { messages: Message[]; hasMore: boolean };
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
  | {
      type: "message.final";
      entry: { id: string; role: "assistant" | "toolResult"; content: string; created_at: string };
    }
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
export type DeviceAuth = { userCode: string; verificationUri: string; expiresInSeconds: number };

export function parseDeviceAuth(content: string): DeviceAuth | undefined {
  const match = content.match(
    /^OpenAI Codexの再認証が必要です。\n\n\[認証ページを開く\]\((https:\/\/[^\s)]+)\)\n\nコード: `([^`]+)`$/,
  );
  if (!match) return;
  return { verificationUri: match[1], userCode: match[2], expiresInSeconds: 0 };
}

export type ThinkingLevel = "auto" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type Bootstrap = {
  user: {
    id: string;
    username: string;
    display_name: string;
    avatar: string | null;
    language: string;
    ctrl_enter_send: number;
    thinking_level: ThinkingLevel;
  };
  supported_thinking_levels: ThinkingLevel[];
  model: { id: string; supportedThinkingLevels: ThinkingLevel[] };
  users: UserSummary[];
  invitations: ProjectInvitation[];
  projects: Project[];
  conversations: Conversation[];
  files: FileItem[];
};

export async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`サーバーがJSONではない応答を返しました (HTTP ${response.status})`);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (response.status === 401) {
    location.href = new URL("/login", location.origin).toString();
    throw new Error("unauthorized");
  }
  if (!response.ok) {
    const body = await readJson<{ error?: string }>(response).catch(() => null);
    throw new Error(body?.error || `HTTP ${response.status}`);
  }
  return response.status === 204 ? (undefined as T) : readJson<T>(response);
}

export const getBootstrap = () => api<Bootstrap>("/api/bootstrap");

export function socketUrl() {
  const origin = process.env.NEXT_PUBLIC_API_ORIGIN || location.origin;
  return `${origin.replace(/^http/, "ws")}/api/socket`;
}
