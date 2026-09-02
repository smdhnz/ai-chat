export type SettingsTab = "chat" | "projects" | "invitations" | "skills" | "files";

export const settingsTabLabels: Record<SettingsTab, string> = {
  chat: "標準チャット",
  projects: "プロジェクト",
  invitations: "プロジェクト招待",
  skills: "スキル",
  files: "画像",
};
