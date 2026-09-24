"use client";

import { useId, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { NativeDialog } from "@/components/native-dialog";
import { useTextLongPress } from "../_hooks/use-text-long-press";

export function TextSelection({
  text,
  disabled,
  children,
}: {
  text: string;
  disabled: boolean;
  children: ReactNode;
}) {
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const inputId = useId();
  const longPress = useTextLongPress(() => setSelectedText(text), disabled || !text);

  return (
    <>
      <div className={disabled ? undefined : "text-selection-trigger"} {...longPress}>
        {children}
      </div>
      {text && !disabled && (
        <button
          type="button"
          className="sr-only focus:not-sr-only"
          onClick={() => setSelectedText(text)}
          aria-haspopup="dialog"
        >
          テキスト選択
        </button>
      )}
      {selectedText !== null &&
        createPortal(
          <NativeDialog
            open
            onClose={() => setSelectedText(null)}
            label="テキスト選択"
            className="fixed inset-0 h-dvh w-full overflow-hidden"
            focusDialog
          >
            <div className="flex h-full flex-col gap-3 bg-background px-4 pt-[max(12px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))]">
              <header className="flex shrink-0 items-center justify-between">
                <label htmlFor={inputId} className="text-sm font-semibold">
                  テキスト選択
                </label>
                <button
                  type="button"
                  className="inline-flex size-11 items-center justify-center"
                  aria-label="テキスト選択を閉じる"
                  onClick={() => setSelectedText(null)}
                >
                  <X className="size-5" />
                </button>
              </header>
              <p className="shrink-0 text-xs text-muted-foreground">
                本文を長押しし、範囲を選択してコピーできます。
              </p>
              <textarea
                id={inputId}
                readOnly
                value={selectedText}
                className="min-h-0 w-full flex-1 resize-none rounded-xl border border-border bg-background p-3 text-base leading-relaxed focus-visible:outline-2 focus-visible:outline-primary"
              />
            </div>
          </NativeDialog>,
          document.body,
        )}
    </>
  );
}
