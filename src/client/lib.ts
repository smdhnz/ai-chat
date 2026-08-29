import { useEffect, useRef, useState } from "react";
import { BookOpen, Briefcase, Code2, Folder, Palette, Rocket } from "lucide-react";

export const ease = [0.22, 1, 0.36, 1] as const;

export const iconButtonClass =
  "flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-[13px] border-0 bg-transparent transition duration-200 ease-out hover:-translate-y-px hover:bg-panel-2 [&_svg]:w-5";

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

export function conversationFromPath(): string | null {
  return location.pathname.match(/^\/chat\/([\w-]+)$/)?.[1] || null;
}

export type SettingsTab = "projects" | "skills" | "files" | "general";

export const settingsTabFromPath = (): SettingsTab => {
  const tab = location.pathname.match(/^\/settings\/(projects|skills|files|general)$/)?.[1];
  return (tab as SettingsTab) || "projects";
};

export const temporaryFromUrl = () => new URLSearchParams(location.search).get("temporary") === "1";

export const chatUrl = (path: string, temporary: boolean) =>
  `${path}${temporary ? "?temporary=1" : ""}`;

export function navigate(url: string, replace = false) {
  history[replace ? "replaceState" : "pushState"](null, "", url);
  dispatchEvent(new PopStateEvent("popstate"));
}

export function useTheme() {
  const [dark, setDark] = useState(() => localStorage.theme === "dark");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.theme = dark ? "dark" : "light";
  }, [dark]);
  return { dark, toggle: () => setDark((value) => !value) };
}

export function useCopy() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return {
    copied,
    copy(text: string) {
      void navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2_000);
    },
  };
}

export function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
