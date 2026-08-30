"use client";

import { type MouseEventHandler, useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { NativeDialog } from "@/components/native-dialog";

export function ImageDialog({
  open,
  onOpenChange,
  src,
  name,
  downloadUrl = src,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string;
  name: string;
  downloadUrl?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [closing, setClosing] = useState(false);
  const [presented, setPresented] = useState(false);
  const visible = open && presented && !closing;

  const shareImage: MouseEventHandler<HTMLAnchorElement> = async (event) => {
    if (!navigator.share || !navigator.canShare) return;

    event.preventDefault();
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`画像を取得できませんでした: ${response.status}`);
      const blob = await response.blob();
      const file = new File([blob], name, { type: blob.type });
      if (!navigator.canShare({ files: [file] })) {
        location.assign(downloadUrl);
        return;
      }
      await navigator.share({ files: [file] });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      location.assign(downloadUrl);
    }
  };

  useEffect(() => {
    if (!open) {
      setPresented(false);
      return;
    }
    setClosing(false);
    const frame = requestAnimationFrame(() => setPresented(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  return (
    <NativeDialog
      open={open}
      onClose={() => setClosing(true)}
      label="画像プレビュー"
      className="fixed inset-0 size-full overflow-hidden"
      focusDialog
    >
      <motion.div
        className="relative flex size-full items-center justify-center overflow-hidden p-4 pt-[max(76px,calc(env(safe-area-inset-top)+64px))] pb-[max(24px,env(safe-area-inset-bottom))]"
        initial={{ backgroundColor: "rgb(8 8 10 / 0)" }}
        animate={{ backgroundColor: visible ? "rgb(8 8 10 / 0.94)" : "rgb(8 8 10 / 0)" }}
        transition={{ duration: reduceMotion ? 0 : 0.36 }}
        onClick={(event) => event.target === event.currentTarget && setClosing(true)}
        onAnimationComplete={() => {
          if (closing) onOpenChange(false);
        }}
      >
        <motion.header
          className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))]"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : -12 }}
          transition={{ duration: reduceMotion ? 0 : 0.24 }}
        >
          <button
            type="button"
            className="liquid-glass liquid-glass-control inline-flex size-11 items-center justify-center rounded-full [&_svg]:size-5"
            aria-label="画像を閉じる"
            onClick={() => setClosing(true)}
          >
            <X />
          </button>
          <a
            href={downloadUrl}
            download={name}
            className="liquid-glass liquid-glass-control inline-flex h-11 items-center gap-2 rounded-full px-4 text-[13px] font-semibold [&_svg]:size-[18px]"
            aria-label="画像を保存"
            onClick={shareImage}
          >
            <Download />
            保存
          </a>
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
