export const projectColors = ["clay", "blue", "green", "purple", "gold", "rose"] as const;

export type SettingsTab = "projects" | "skills" | "files" | "general";

export const settingsTabs: SettingsTab[] = ["general", "projects", "skills", "files"];

export const settingsTabLabels: Record<SettingsTab, string> = {
  projects: "プロジェクト",
  skills: "スキル",
  files: "ファイル",
  general: "一般",
};

export const settingsTabFromPath = (pathname: string): SettingsTab =>
  (pathname.match(/^\/settings\/(projects|skills|files|general)$/)?.[1] as SettingsTab) ||
  "general";

export function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
