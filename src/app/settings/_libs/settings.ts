export type SettingsTab = "chat" | "projects" | "invitations" | "files";

export const settingsTabLabels: Record<SettingsTab, string> = {
  chat: "一般",
  projects: "プロジェクト",
  invitations: "プロジェクト招待",
  files: "画像",
};
