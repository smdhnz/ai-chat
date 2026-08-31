import { Folder } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProjectIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-[color-mix(in_srgb,var(--primary)_13%,var(--card))] text-primary [&_svg]:w-4",
        className,
      )}
    >
      <Folder />
    </span>
  );
}
