"use client";

import { useEffect, useRef, useState } from "react";

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
