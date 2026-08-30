"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { iconButtonClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  const label = dark ? "ライトテーマに変更" : "ダークテーマに変更";
  return (
    <button
      type="button"
      className={cn(iconButtonClass, "inline-flex items-center justify-center")}
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={label}
    >
      {dark ? <Sun /> : <Moon />}
    </button>
  );
}
