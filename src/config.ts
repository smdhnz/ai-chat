import { resolve } from "node:path";

const env = (name: string, fallback = "") => process.env[name]?.trim() || fallback;
const required = (name: string) => {
  const value = env(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
};

export const config = {
  port: Number(env("PORT", "3000")),
  origin: env("APP_ORIGIN", "http://localhost:3000").replace(/\/$/, ""),
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
  aiTimeoutMs: Number(env("AI_TIMEOUT_MS", "600000")),
  maxUploadBytes: Number(env("MAX_UPLOAD_BYTES", String(20 * 1024 * 1024))),
};
