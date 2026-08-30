import { BookOpen, Briefcase, Code2, Folder, Palette, Rocket } from "lucide-react";

export const ease = [0.22, 1, 0.36, 1] as const;

export const iconButtonClass =
  "size-10 rounded-full border border-white/15 bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_8px_24px_rgba(0,0,0,0.24)] backdrop-blur-xl transition duration-200 ease-out active:scale-95 [&_svg:not([class*='size-'])]:size-5";

export const projectColorClasses = {
  clay: "[--project-color:#5865f2]",
  blue: "[--project-color:#3498db]",
  green: "[--project-color:#23a55a]",
  purple: "[--project-color:#9b59b6]",
  gold: "[--project-color:#f0b232]",
  rose: "[--project-color:#eb459e]",
} as const;

export const projectIcons = {
  folder: Folder,
  briefcase: Briefcase,
  code: Code2,
  book: BookOpen,
  palette: Palette,
  rocket: Rocket,
};
