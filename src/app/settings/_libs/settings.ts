export type SettingsTab = "chat" | "skills" | "projects" | "invitations" | "files";

export const settingsTabLabels: Record<SettingsTab, string> = {
  chat: "一般",
  skills: "スキル",
  projects: "プロジェクト",
  invitations: "プロジェクト招待",
  files: "画像",
};
