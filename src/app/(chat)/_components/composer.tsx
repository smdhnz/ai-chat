"use client";

import { useEffect, useRef, type FormEvent } from "react";
import { ArrowUp, File, Paperclip, Pencil, Square, TimerReset, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function Composer(props: {
  prompt: string;
  setPrompt: (v: string) => void;
  files: File[];
  setFiles: (v: File[]) => void;
  temporary: boolean;
  mobile: boolean;
  ctrlEnterSend: boolean;
  generating: boolean;
  editing: boolean;
  cancelEditing: () => void;
  stop: () => Promise<void>;
  send: (e: FormEvent) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  // The textarea grows with its content, so its height has to follow the value
  // itself: clearing the prompt after sending must shrink it back.
  useEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 180)}px`;
  }, [props.prompt]);
  const sendButtonClass =
    "size-[34px] rounded-[11px] shadow-[0_7px_18px_color-mix(in_srgb,var(--primary)_30%,transparent)] transition duration-200 max-md:order-3 max-md:mr-2 max-md:mb-[7px]";
  return (
    <footer className="z-5 mx-auto w-[min(850px,calc(100%-32px))] shrink-0 pb-[max(10px,env(safe-area-inset-bottom))] transition-[width] max-md:w-[calc(100%-64px)] max-md:pb-[max(7px,env(safe-area-inset-bottom))] max-md:focus-within:w-[calc(100%-18px)]">
      <form
        className={`overflow-hidden rounded-[22px] border bg-background shadow-[0_15px_50px_#28253318] max-md:rounded-[18px] ${props.temporary ? "border-2 border-dashed border-[color-mix(in_srgb,var(--primary)_55%,var(--border))]" : "border-border"}`}
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
            <Button
              variant="ghost"
              className="ml-auto h-auto p-0 text-[10px] font-normal text-muted-foreground hover:bg-transparent"
              type="button"
              onClick={props.cancelEditing}
            >
              キャンセル
            </Button>
          </div>
        )}
        {props.files.length > 0 && (
          <div className="overflow-x-auto overscroll-x-contain px-2.5 pt-2.5">
            <div className="flex w-max gap-[7px]">
              {props.files.map((file, index) => (
                <Badge
                  key={`${file.name}-${index}`}
                  variant="secondary"
                  className="h-[30px] max-w-[220px] gap-1.5 rounded-[9px] bg-muted pr-[7px] pl-[9px] text-[10px] font-normal text-foreground"
                >
                  <File className="size-[13px] shrink-0" />
                  <span className="truncate">{file.name}</span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-auto p-0.5 hover:bg-transparent [&_svg:not([class*='size-'])]:size-3"
                    type="button"
                    aria-label={`${file.name}を削除`}
                    onClick={() => props.setFiles(props.files.filter((_, i) => i !== index))}
                  >
                    <X />
                  </Button>
                </Badge>
              ))}
            </div>
          </div>
        )}
        <div className="max-md:flex max-md:items-end">
          <Textarea
            ref={textarea}
            className="block max-h-[180px] min-h-[50px] w-full resize-none rounded-none border-0 bg-transparent px-[17px] pt-[15px] pb-[7px] text-sm leading-[1.6] shadow-none focus-visible:border-0 focus-visible:ring-0 md:text-sm max-md:order-2 max-md:min-h-12 max-md:w-auto max-md:min-w-0 max-md:flex-1 max-md:px-2 max-md:pt-[11px] max-md:pb-2 max-md:text-base"
            value={props.prompt}
            onChange={(event) => props.setPrompt(event.target.value)}
            onPaste={(event) => {
              if (props.editing) return;
              const images = Array.from(event.clipboardData.files).filter((file) =>
                file.type.startsWith("image/"),
              );
              if (images.length) {
                event.preventDefault();
                props.setFiles([...props.files, ...images]);
              }
            }}
            onKeyDown={(event) => {
              if (props.mobile || event.key !== "Enter") return;
              const send = props.ctrlEnterSend ? event.ctrlKey : !event.shiftKey;
              if (send) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="メッセージを入力"
            rows={1}
          />
          <div className="flex h-[45px] items-center gap-[3px] px-2 pt-[3px] pb-[7px] max-md:contents">
            <input
              ref={input}
              type="file"
              multiple
              hidden
              onChange={(event) =>
                props.setFiles([...props.files, ...Array.from(event.target.files || [])])
              }
            />
            {!props.editing && (
              <Button
                type="button"
                variant="ghost"
                className="h-[34px] gap-1.5 rounded-[10px] px-[9px] text-[11px] font-normal text-muted-foreground transition duration-200 max-md:order-1 max-md:mr-0 max-md:mb-[7px] max-md:ml-2 [&_svg:not([class*='size-'])]:size-4"
                onClick={() => input.current?.click()}
                aria-label="ファイルを添付"
              >
                <Paperclip />
              </Button>
            )}
            <span className="flex-1 max-md:hidden" />
            {props.generating ? (
              <Button
                type="button"
                size="icon"
                className={`${sendButtonClass} [&_svg:not([class*='size-'])]:size-3 [&_svg]:fill-current`}
                onClick={() => void props.stop()}
                aria-label="生成を停止"
              >
                <Square />
              </Button>
            ) : (
              <Button
                size="icon"
                className={`${sendButtonClass} disabled:opacity-30 disabled:shadow-none [&_svg:not([class*='size-'])]:size-[17px]`}
                disabled={!props.prompt.trim() && !props.files.length}
                aria-label={props.editing ? "編集して再生成" : "送信"}
              >
                <ArrowUp />
              </Button>
            )}
          </div>
        </div>
      </form>
    </footer>
  );
}
