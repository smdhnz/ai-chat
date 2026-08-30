"use client";

import { useEffect, useState } from "react";
import { CircleAlert, LoaderCircle, Trash2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
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
  const reduceMotion = useReducedMotion();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [closing, setClosing] = useState(false);
  const [presented, setPresented] = useState(false);
  const visible = open && presented && !closing;

  useEffect(() => {
    if (!open) {
      setPresented(false);
      return;
    }
    setClosing(false);
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setPresented(true));
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [open]);

  function close() {
    if (deleting) return;
    setError("");
    setClosing(true);
  }

  async function confirm() {
    setDeleting(true);
    try {
      await onConfirm();
      setError("");
      setClosing(true);
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
      className="fixed inset-0 size-full overflow-hidden"
    >
      <motion.div
        className="flex size-full items-end"
        initial={false}
        animate={{ backgroundColor: visible ? "rgb(0 0 0 / 0.45)" : "rgb(0 0 0 / 0)" }}
        transition={{ duration: reduceMotion ? 0 : 0.2 }}
        onClick={(event) => event.target === event.currentTarget && close()}
      >
        {presented && (
          <motion.section
            className={`${drawerPanelClass} w-full border-t shadow-[0_-20px_60px_rgba(0,0,0,0.3)]`}
            initial={{ y: "100%" }}
            animate={{ y: visible ? 0 : "100%" }}
            transition={{ duration: reduceMotion ? 0 : 0.38, ease: [0.32, 0.72, 0, 1] }}
            onAnimationComplete={() => {
              if (closing) onOpenChange(false);
            }}
          >
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
                className={`${buttonClass} gap-1.5 border-[color-mix(in_srgb,var(--destructive)_35%,var(--border))] bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)] text-destructive hover:bg-[color-mix(in_srgb,var(--destructive)_16%,transparent)] [&_svg]:size-3.5`}
                disabled={deleting}
                onClick={() => void confirm()}
              >
                {deleting ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
                {deleting ? "削除中" : "削除"}
              </button>
            </footer>
          </motion.section>
        )}
      </motion.div>
    </NativeDialog>
  );
}
