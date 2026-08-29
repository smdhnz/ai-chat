import { Folder } from "lucide-react";
import type { Project } from "@/lib/api";
import { projectColorClasses, projectIcons } from "@/lib/ui";
import { cn } from "@/lib/utils";

export function ProjectIcon({ project, className }: { project?: Project; className?: string }) {
  const Icon = projectIcons[project?.icon as keyof typeof projectIcons] || Folder;
  const color = project?.color as keyof typeof projectColorClasses;
  return (
    <span
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-[color-mix(in_srgb,var(--project-color)_13%,var(--card))] text-[var(--project-color)] [&_svg]:w-4",
        projectColorClasses[color] || projectColorClasses.clay,
        className,
      )}
    >
      <Icon />
    </span>
  );
}
