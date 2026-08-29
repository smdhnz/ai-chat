"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { iconButtonClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  const label = dark ? "ライトテーマに変更" : "ダークテーマに変更";
  return (
    <Button
      variant="ghost"
      size="icon-lg"
      className={cn(iconButtonClass)}
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={label}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}
