"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, Image, Pencil, Square, TimerReset, X } from "lucide-react";

const isSupportedImage = (file: File) => /^image\/(png|jpeg|webp|gif)$/i.test(file.type);

function focusWithoutViewportScroll(element: HTMLTextAreaElement) {
  const transform = element.style.transform;
  element.style.transform = "translateY(-2000px)";
  element.focus({ preventScroll: true });
  requestAnimationFrame(() => {
    element.style.transform = transform;
  });
}

function ImagePreview({ file, remove }: { file: File; remove: () => void }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  return (
    <div className="relative size-16 shrink-0 overflow-hidden rounded-[12px] border border-border bg-muted">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="size-full object-cover" src={url} alt={file.name} />
      )}
      <button
        className="absolute top-1 right-1 inline-flex size-5 items-center justify-center rounded-full bg-black/65 text-white [&_svg]:size-3"
        type="button"
        aria-label={`${file.name}を削除`}
        onClick={remove}
      >
        <X />
      </button>
    </div>
  );
}

export function Composer(props: {
  prompt: string;
  setPrompt: (v: string) => void;
  files: File[];
  setFiles: (v: File[]) => void;
  temporary: boolean;
  generating: boolean;
  editing: boolean;
  cancelEditing: () => void;
  stop: () => Promise<void>;
  send: (e: FormEvent) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 180)}px`;
  }, [props.prompt]);
  useEffect(() => {
    if (props.editing && textarea.current) focusWithoutViewportScroll(textarea.current);
  }, [props.editing]);
  const sendButtonClass =
    "order-3 mr-2 mb-[7px] inline-flex size-[34px] items-center justify-center rounded-full bg-[linear-gradient(150deg,#c99bc5,#9f7ab8)] text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_7px_18px_color-mix(in_srgb,#9f7ab8_30%,transparent)] transition duration-200 active:scale-95 disabled:pointer-events-none disabled:opacity-30 disabled:shadow-none";

  return (
    <footer className="absolute inset-x-0 bottom-0 z-5 shrink-0 pb-[var(--composer-bottom-padding,max(15px,env(safe-area-inset-bottom)))]">
      <form
        className="liquid-glass-field relative mx-auto w-[calc(100%-80px)] overflow-hidden rounded-[25px] border border-white/20 transition-[width] has-[textarea:focus]:w-[calc(100%-34px)]"
        onSubmit={props.send}
      >
        {props.temporary && (
          <span className="mx-3.5 mt-2.5 mb-[-6px] flex w-max items-center gap-[5px] text-[9px] font-bold text-primary [&_svg]:w-3">
            <TimerReset />
            一時チャット
          </span>
        )}
        {props.editing && (
          <div className="mx-3.5 mt-2.5 mb-[-5px] flex items-center gap-1.5 text-[10px] text-primary [&_svg]:w-[13px]">
            <Pencil />
            選択したメッセージを編集中
            <button
              className="ml-auto h-auto p-0 text-[10px] font-normal text-primary"
              type="button"
              onClick={props.cancelEditing}
            >
              キャンセル
            </button>
          </div>
        )}
        {props.files.length > 0 && (
          <div className="overflow-x-auto overscroll-x-contain px-2.5 pt-2.5">
            <div className="flex w-max gap-[7px]">
              {props.files.map((file, index) => (
                <ImagePreview
                  key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                  file={file}
                  remove={() => props.setFiles(props.files.filter((_, i) => i !== index))}
                />
              ))}
            </div>
          </div>
        )}
        <div className="flex items-end">
          <textarea
            ref={textarea}
            className="order-2 block max-h-[180px] min-h-12 w-auto min-w-0 flex-1 resize-none rounded-none border-0 bg-transparent px-2 pt-[11px] pb-2 text-base leading-[1.6] outline-none placeholder:text-muted-foreground"
            value={props.prompt}
            onTouchEnd={(event) => {
              if (document.activeElement === event.currentTarget) return;
              event.preventDefault();
              focusWithoutViewportScroll(event.currentTarget);
            }}
            onChange={(event) => props.setPrompt(event.target.value)}
            onPaste={(event) => {
              if (props.editing) return;
              const images = Array.from(event.clipboardData.files).filter(isSupportedImage);
              if (images.length) {
                event.preventDefault();
                props.setFiles([...props.files, ...images]);
              }
            }}
            placeholder="メッセージを入力"
            rows={1}
          />
          <div className="contents">
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              hidden
              onChange={(event) => {
                props.setFiles([
                  ...props.files,
                  ...Array.from(event.target.files || []).filter(isSupportedImage),
                ]);
                event.currentTarget.value = "";
              }}
            />
            {!props.editing && (
              <button
                type="button"
                className="order-1 mr-0 mb-[7px] ml-2 inline-flex size-[34px] items-center justify-center text-muted-foreground transition-colors active:text-foreground [&_svg]:size-[18px]"
                onClick={() => input.current?.click()}
                aria-label="画像を添付"
              >
                <Image />
              </button>
            )}
            {props.generating ? (
              <button
                type="button"
                className={`${sendButtonClass} [&_svg]:size-3 [&_svg]:fill-current`}
                onClick={() => void props.stop()}
                aria-label="生成を停止"
              >
                <Square />
              </button>
            ) : (
              <button
                className={`${sendButtonClass} [&_svg]:size-[17px]`}
                disabled={!props.prompt.trim() && !props.files.length}
                aria-label={props.editing ? "編集して再生成" : "送信"}
              >
                <ArrowUp />
              </button>
            )}
          </div>
        </div>
      </form>
    </footer>
  );
}
