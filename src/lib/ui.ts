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
