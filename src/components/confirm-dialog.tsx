"use client";

import { useState } from "react";
import { CircleAlert, LoaderCircle, Trash2 } from "lucide-react";
import { NativeDialog } from "@/components/native-dialog";

export const drawerPanelClass = "rounded-t-[25px] border-border bg-card";
export const dialogHeaderClass =
  "flex h-[62px] shrink-0 flex-row items-center gap-0 pr-[18px] pl-[22px] text-left";
export const dialogTitleClass = "flex-1 text-base font-bold";

const buttonClass =
  "inline-flex h-[38px] items-center justify-center rounded-[11px] border px-3.5 text-xs disabled:pointer-events-none disabled:opacity-50";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  text,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  text: string;
  onConfirm: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  function close() {
    if (deleting) return;
    setError("");
    onOpenChange(false);
  }

  async function confirm() {
    setDeleting(true);
    try {
      await onConfirm();
      setError("");
      onOpenChange(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <NativeDialog
      open={open}
      onClose={close}
      label={title}
      closeOnBackdrop={!deleting}
      className="fixed inset-0 size-full"
    >
      <div
        className="flex size-full items-end bg-black/20"
        onClick={(event) => event.target === event.currentTarget && close()}
      >
        <section className={`${drawerPanelClass} w-full border-t`}>
          <header className={`${dialogHeaderClass} h-auto min-h-[68px] py-[18px]`}>
            <h2 className={dialogTitleClass}>{title}</h2>
          </header>
          <div className="border-t border-border px-[22px] pt-[22px]">
            <p className="m-0 text-[13px] leading-[1.7] text-muted-foreground">{text}</p>
            {error && (
              <div
                role="alert"
                className="mt-2.5 flex gap-2 rounded-[11px] border border-destructive/50 p-3 text-destructive"
              >
                <CircleAlert className="size-4 shrink-0" />
                <p className="text-[13px]">{error}</p>
              </div>
            )}
          </div>
          <footer className="flex justify-end gap-2 px-[22px] pt-[22px] pb-[max(28px,env(safe-area-inset-bottom))]">
            <button
              type="button"
              className={`${buttonClass} border-border text-foreground`}
              disabled={deleting}
              onClick={close}
            >
              キャンセル
            </button>
            <button
              type="button"
              className={`${buttonClass} gap-1.5 border-[color-mix(in_srgb,#de6b76_35%,var(--border))] bg-[color-mix(in_srgb,#de6b76_10%,transparent)] text-destructive hover:bg-[color-mix(in_srgb,#de6b76_16%,transparent)] [&_svg]:size-3.5`}
              disabled={deleting}
              onClick={() => void confirm()}
            >
              {deleting ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
              {deleting ? "削除中" : "削除"}
            </button>
          </footer>
        </section>
      </div>
    </NativeDialog>
  );
}
