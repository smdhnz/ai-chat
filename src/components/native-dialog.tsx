"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function NativeDialog({
  open,
  onClose,
  label,
  className,
  children,
  closeOnBackdrop = true,
  focusDialog = false,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  className?: string;
  children: ReactNode;
  closeOnBackdrop?: boolean;
  focusDialog?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      if (focusDialog) dialog.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [focusDialog, open]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      tabIndex={focusDialog ? -1 : undefined}
      className={cn(
        "m-0 max-h-none max-w-none bg-transparent p-0 text-foreground backdrop:bg-transparent",
        className,
      )}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
