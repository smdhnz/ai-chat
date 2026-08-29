import { useRef, type FormEvent } from "react";
import { ArrowUp, File, Paperclip, Pencil, Square, TimerReset, X } from "lucide-react";

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
  return (
    <footer className="z-5 mx-auto w-[min(850px,calc(100%-32px))] shrink-0 pb-[max(10px,env(safe-area-inset-bottom))] transition-[width] max-md:w-[calc(100%-64px)] max-md:pb-[max(7px,env(safe-area-inset-bottom))] max-md:focus-within:w-[calc(100%-18px)]">
      <form
        className={`overflow-hidden rounded-[22px] border bg-glass shadow-[0_15px_50px_#28253318] backdrop-blur-[22px] max-md:rounded-[18px] ${props.temporary ? "border-2 border-dashed border-[color-mix(in_srgb,var(--accent)_55%,var(--line))]" : "border-line"}`}
        onSubmit={props.send}
      >
        {props.temporary && (
          <span className="mx-3.5 mt-2.5 mb-[-6px] flex w-max items-center gap-[5px] text-[9px] font-bold text-accent [&_svg]:w-3">
            <TimerReset />
            一時チャット
          </span>
        )}
        {props.editing && (
          <div className="mx-3.5 mt-2.5 mb-[-5px] flex items-center gap-1.5 text-[10px] text-accent [&_svg]:w-[13px]">
            <Pencil />
            選択したメッセージを編集中
            <button
              className="ml-auto cursor-pointer border-0 bg-transparent text-muted"
              type="button"
              onClick={props.cancelEditing}
            >
              キャンセル
            </button>
          </div>
        )}
        {props.files.length > 0 && (
          <div className="flex gap-[7px] overflow-x-auto px-2.5 pt-2.5 [&>span]:flex [&>span]:h-[30px] [&>span]:max-w-[220px] [&>span]:items-center [&>span]:gap-1.5 [&>span]:whitespace-nowrap [&>span]:rounded-[9px] [&>span]:bg-panel-2 [&>span]:pr-[7px] [&>span]:pl-[9px] [&>span]:text-[10px] [&>span>svg]:w-[13px] [&>span>svg]:shrink-0 [&_button]:cursor-pointer [&_button]:border-0 [&_button]:bg-transparent [&_button]:p-0.5 [&_button_svg]:w-3">
            {props.files.map((file, index) => (
              <span key={`${file.name}-${index}`}>
                <File />
                {file.name}
                <button
                  type="button"
                  onClick={() => props.setFiles(props.files.filter((_, i) => i !== index))}
                >
                  <X />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="max-md:flex max-md:items-end">
          <textarea
            className="block min-h-[50px] max-h-[180px] w-full resize-none border-0 bg-transparent px-[17px] pt-[15px] pb-[7px] text-sm leading-[1.6] text-text outline-0 placeholder:text-muted focus-visible:outline-none max-md:order-2 max-md:min-h-12 max-md:w-auto max-md:min-w-0 max-md:flex-1 max-md:px-2 max-md:pt-[11px] max-md:pb-2 max-md:text-base"
            value={props.prompt}
            onChange={(event) => {
              props.setPrompt(event.target.value);
              event.target.style.height = "auto";
              event.target.style.height = `${Math.min(event.target.scrollHeight, 180)}px`;
            }}
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
              <button
                type="button"
                className="flex h-[34px] cursor-pointer items-center gap-1.5 rounded-[10px] border-0 bg-transparent px-[9px] text-[11px] text-muted transition duration-200 hover:bg-panel-2 hover:text-text max-md:order-1 max-md:mr-0 max-md:mb-[7px] max-md:ml-2 [&_svg]:w-4"
                onClick={() => input.current?.click()}
                aria-label="ファイルを添付"
                title="ファイルを添付"
              >
                <Paperclip />
              </button>
            )}
            <span className="flex-1 max-md:hidden" />
            {props.generating ? (
              <button
                type="button"
                className="flex size-[34px] cursor-pointer items-center justify-center rounded-[11px] border-0 bg-accent text-white shadow-[0_7px_18px_color-mix(in_srgb,var(--accent)_30%,transparent)] transition duration-200 hover:-translate-y-0.5 max-md:order-3 max-md:mr-2 max-md:mb-[7px] [&_svg]:w-3 [&_svg]:fill-current"
                onClick={() => void props.stop()}
                aria-label="生成を停止"
                title="生成を停止"
              >
                <Square />
              </button>
            ) : (
              <button
                className="flex size-[34px] cursor-pointer items-center justify-center rounded-[11px] border-0 bg-accent text-white shadow-[0_7px_18px_color-mix(in_srgb,var(--accent)_30%,transparent)] transition duration-200 hover:not-disabled:-translate-y-0.5 disabled:opacity-30 disabled:shadow-none max-md:order-3 max-md:mr-2 max-md:mb-[7px] [&_svg]:w-[17px]"
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
