"use client";

import { useEffect, useState } from "react";
import { Share2, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { NativeDialog } from "@/components/native-dialog";
import { LoadingWave } from "@/components/loading-wave";

export function ImageDialog({
  open,
  onOpenChange,
  src,
  name,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string;
  name: string;
}) {
  const reduceMotion = useReducedMotion();
  const [closing, setClosing] = useState(false);
  const [presented, setPresented] = useState(false);
  const [sharing, setSharing] = useState(false);
  const visible = open && presented && !closing;

  useEffect(() => {
    if (!open) {
      setPresented(false);
      return;
    }
    setClosing(false);
    const frame = requestAnimationFrame(() => setPresented(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  async function shareImage() {
    setSharing(true);
    try {
      if (!navigator.share) throw new Error("この端末は画像の共有に対応していません");
      const response = await fetch(src);
      if (!response.ok) throw new Error("画像を取得できませんでした");
      const blob = await response.blob();
      const file = new File([blob], name, { type: blob.type });
      if (navigator.canShare && !navigator.canShare({ files: [file] }))
        throw new Error("この画像は共有できません");
      await navigator.share({ files: [file] });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        toast.error(error instanceof Error ? error.message : "画像を共有できませんでした");
    } finally {
      setSharing(false);
    }
  }

  function close() {
    if (!sharing) setClosing(true);
  }

  return (
    <NativeDialog
      open={open}
      onClose={close}
      label="画像プレビュー"
      className="fixed inset-0 size-full overflow-hidden"
      closeOnBackdrop={!sharing}
      focusDialog
    >
      <motion.div
        className="relative flex size-full items-center justify-center overflow-hidden p-4 pt-[max(76px,calc(env(safe-area-inset-top)+64px))] pb-[max(24px,env(safe-area-inset-bottom))]"
        initial={{ backgroundColor: "rgb(8 8 10 / 0)" }}
        animate={{ backgroundColor: visible ? "rgb(8 8 10 / 0.94)" : "rgb(8 8 10 / 0)" }}
        transition={{ duration: reduceMotion ? 0 : 0.36 }}
        onClick={(event) => event.target === event.currentTarget && close()}
        onAnimationComplete={() => {
          if (closing) onOpenChange(false);
        }}
      >
        <motion.header
          className="absolute inset-x-0 top-0 z-1 flex items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))]"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : -12 }}
          transition={{ duration: reduceMotion ? 0 : 0.24 }}
        >
          <button
            type="button"
            className="liquid-glass liquid-glass-control inline-flex size-11 items-center justify-center rounded-full [&_svg]:size-5"
            aria-label="画像を閉じる"
            disabled={sharing}
            onClick={close}
          >
            <X />
          </button>
          <button
            type="button"
            className="liquid-glass liquid-glass-control inline-flex h-11 items-center gap-2 rounded-full px-4 text-[13px] font-semibold disabled:opacity-60 [&_svg]:size-[18px]"
            aria-label="画像を保存"
            disabled={sharing}
            onClick={() => void shareImage()}
          >
            {sharing ? <LoadingWave className="text-base" /> : <Share2 />}
            {sharing ? "準備中" : "保存"}
          </button>
        </motion.header>
        {src && (
          <motion.img
            className="block max-h-full max-w-full rounded-[18px] object-contain shadow-[0_30px_100px_rgba(0,0,0,0.65)]"
            src={src}
            alt={name}
            initial={{ opacity: 0, scale: 0.94, y: 18 }}
            animate={{ opacity: visible ? 1 : 0, scale: visible ? 1 : 0.94, y: visible ? 0 : 18 }}
            transition={{
              duration: reduceMotion ? 0 : 0.36,
              ease: [0.22, 1, 0.36, 1],
            }}
          />
        )}
      </motion.div>
    </NativeDialog>
  );
}
