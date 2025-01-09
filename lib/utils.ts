import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function codeBlockParse(content: string) {
  const occurrences = (content.match(/```/g) || []).length;

  if (occurrences % 2 !== 0) {
    return content + "\n```";
  }

  return content;
}
