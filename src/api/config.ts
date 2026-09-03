import { join, resolve } from "node:path";

const env = (name: string, fallback = "") => process.env[name]?.trim() || fallback;
const required = (name: string) => {
  const value = env(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
};

export const config = {
  port: Number(env("PORT", "3000")),
  origin: env("APP_ORIGIN", "http://localhost:3000").replace(/\/$/, ""),
  webOrigin: env("WEB_ORIGIN", "http://127.0.0.1:3002").replace(/\/$/, ""),
  discordClientId: required("DISCORD_CLIENT_ID"),
  discordClientSecret: required("DISCORD_CLIENT_SECRET"),
  allowedDiscordIds: new Set(
    required("ALLOWED_DISCORD_USER_IDS")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  ),
  cookieSecure: env("COOKIE_SECURE", "1") !== "0",
  dataDir: resolve(env("DATA_DIR", "data")),
  codexModel: env("CODEX_MODEL", "gpt-5.6-sol"),
  aiTimeoutMs: Number(env("AI_TIMEOUT_MS", "600000")),
  maxUploadBytes: Number(env("MAX_UPLOAD_BYTES", String(20 * 1024 * 1024))),
  skillExecutorUrl: env("SKILL_EXECUTOR_URL"),
};

// Stored file paths are absolute and can predate a move of the project or data
// directory, so re-root them on the current dataDir before touching the disk.
export function storedFilePath(path: string): string {
  const index = path.lastIndexOf("/users/");
  return index < 0 ? path : join(config.dataDir, path.slice(index + 1));
}
