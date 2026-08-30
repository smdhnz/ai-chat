export const projectColors = ["clay", "blue", "green", "purple", "gold", "rose"] as const;

export type SettingsTab = "projects" | "skills" | "files" | "general";

export const settingsTabLabels: Record<SettingsTab, string> = {
  projects: "プロジェクト",
  skills: "スキル",
  files: "画像",
  general: "一般",
};
