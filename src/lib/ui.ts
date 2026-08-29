import { BookOpen, Briefcase, Code2, Folder, Palette, Rocket } from "lucide-react";

export const ease = [0.22, 1, 0.36, 1] as const;

export const iconButtonClass =
  "size-10 rounded-[13px] transition duration-200 ease-out [&_svg:not([class*='size-'])]:size-5";

export const projectColorClasses = {
  clay: "[--project-color:#c15f3c]",
  blue: "[--project-color:#4d78c8]",
  green: "[--project-color:#4b8b62]",
  purple: "[--project-color:#8064b3]",
  gold: "[--project-color:#b8862f]",
  rose: "[--project-color:#b85d79]",
} as const;

export const projectIcons = {
  folder: Folder,
  briefcase: Briefcase,
  code: Code2,
  book: BookOpen,
  palette: Palette,
  rocket: Rocket,
};

export const projectColors = ["clay", "blue", "green", "purple", "gold", "rose"] as const;

export type SettingsTab = "projects" | "skills" | "files" | "general";

export const settingsTabs: SettingsTab[] = ["projects", "skills", "files", "general"];

export const settingsTabLabels: Record<SettingsTab, string> = {
  projects: "プロジェクト",
  skills: "スキル",
  files: "ファイル",
  general: "一般",
};

export const conversationIdFromPath = (pathname: string): string | null =>
  pathname.match(/^\/chat\/([\w-]+)$/)?.[1] || null;

export const settingsTabFromPath = (pathname: string): SettingsTab =>
  (pathname.match(/^\/settings\/(projects|skills|files|general)$/)?.[1] as SettingsTab) ||
  "projects";

export const chatUrl = (path: string, temporary: boolean) =>
  `${path}${temporary ? "?temporary=1" : ""}`;

export function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
