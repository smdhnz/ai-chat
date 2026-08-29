import { useRef, useState, type ComponentProps } from "react";
import { AnimatePresence, motion } from "motion/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, File, Pencil, RotateCcw, Sparkles } from "lucide-react";
import { parseDeviceAuth, type DeviceAuth, type FileItem, type Message } from "./api";
import { ease, useCopy } from "./lib";

export function MessageView({
  message,
  disabled,
  regenerate,
  edit,
}: {
  message: Message;
  disabled: boolean;
  regenerate: () => void;
  edit: () => void;
}) {
  const auth = message.auth ?? parseDeviceAuth(message.content);
  const content = auth ? "" : message.content;
  const hasBody = Boolean(content || auth || message.skills?.length);
  const isUser = message.role === "user";
  const collapsible = isUser && content.length > 1200;
  const [expanded, setExpanded] = useState(false);
  return (
    <motion.article
      className={`mb-7 flex gap-3.5 max-md:mb-6 max-md:gap-2.5 ${isUser ? "justify-end" : ""}`}
      initial={{ opacity: 0, y: 14, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.38, ease }}
    >
      <div
        className={`flex min-w-0 max-w-[min(680px,86%)] flex-col items-start max-md:max-w-[87%] ${isUser ? "items-end" : ""}`}
      >
        {isUser && message.files?.length > 0 && <FileBlocks files={message.files} alignEnd />}
        {hasBody && (
          <>
            <div
              className={`min-w-0 max-w-full text-sm leading-[1.78] max-md:text-[13px] [&_a]:text-accent [&_a]:underline [&_code:not(pre_code)]:rounded-[5px] [&_code:not(pre_code)]:bg-panel-2 [&_code:not(pre_code)]:px-[5px] [&_code:not(pre_code)]:py-0.5 [&_code:not(pre_code)]:text-[0.88em] [&_ol]:pl-5 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_td]:border [&_td]:border-line [&_td]:px-[9px] [&_td]:py-[7px] [&_td]:text-left [&_th]:border [&_th]:border-line [&_th]:px-[9px] [&_th]:py-[7px] [&_th]:text-left [&_ul]:pl-5 ${isUser ? "rounded-[20px_20px_6px_20px] border border-[color-mix(in_srgb,var(--accent)_16%,var(--line))] bg-[color-mix(in_srgb,var(--accent)_9%,var(--panel))] px-4 py-[11px] shadow-[0_6px_20px_#5b403010]" : ""} ${collapsible && !expanded ? "max-h-56 overflow-hidden [mask-image:linear-gradient(#000_75%,transparent)]" : ""}`}
            >
              {message.skills && message.skills.length > 0 && (
                <div className="mb-2 flex items-center gap-1.5 text-[10px] text-accent [&_svg]:w-[13px] [&_span]:rounded-full [&_span]:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] [&_span]:px-[7px] [&_span]:py-[3px]">
                  <Sparkles />
                  {message.skills.map((skill) => (
                    <span key={skill}>{skill}</span>
                  ))}
                </div>
              )}
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: CodeBlock }}>
                {content}
              </ReactMarkdown>
              {auth && <AuthCard auth={auth} />}
            </div>
            {collapsible && (
              <button
                className="mt-[5px] cursor-pointer border-0 bg-transparent px-[7px] py-1 text-[10px] text-muted"
                aria-expanded={expanded}
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? "一部表示に戻す" : "全文を表示"}
              </button>
            )}
          </>
        )}
        {!isUser && message.files?.length > 0 && <FileBlocks files={message.files} />}
        {isUser && (
          <div className="mt-[3px] flex self-end [&_button]:flex [&_button]:size-7 [&_button]:cursor-pointer [&_button]:items-center [&_button]:justify-center [&_button]:rounded-lg [&_button]:border-0 [&_button]:bg-transparent [&_button]:p-0 [&_button]:text-muted [&_button:disabled]:cursor-default [&_button:disabled]:opacity-35 [&_button:hover:not(:disabled)]:bg-panel-2 [&_button:hover:not(:disabled)]:text-text [&_svg]:w-3.5">
            <button
              onClick={regenerate}
              disabled={disabled}
              aria-label="このメッセージから再生成"
              title="このメッセージから再生成"
            >
              <RotateCcw />
            </button>
            <button
              onClick={edit}
              disabled={disabled}
              aria-label="このメッセージを編集して再生成"
              title="このメッセージを編集して再生成"
            >
              <Pencil />
            </button>
          </div>
        )}
      </div>
    </motion.article>
  );
}

export function CodeBlock({ children, ...props }: ComponentProps<"pre">) {
  const copy = useCopy();
  const code = useRef<HTMLPreElement>(null);
  return (
    <div className="relative">
      <button
        className="absolute top-2 right-2 z-1 flex size-7 cursor-pointer items-center justify-center rounded-[7px] border border-line bg-panel [&_svg]:w-3.5"
        type="button"
        aria-label="コードをコピー"
        title="コードをコピー"
        onClick={() => copy.copy(code.current?.innerText ?? "")}
      >
        {copy.copied ? <Check /> : <Copy />}
      </button>
      <pre
        className="overflow-auto rounded-[14px] border border-line bg-panel-2 py-4 pr-[52px] pl-4 text-xs leading-[1.6]"
        ref={code}
        {...props}
      >
        {children}
      </pre>
    </div>
  );
}

export function AuthCard({ auth }: { auth: DeviceAuth }) {
  const copy = useCopy();
  return (
    <div className="mt-[15px] flex flex-col gap-2.5 rounded-[17px] border border-[color-mix(in_srgb,#e4a356_38%,var(--line))] bg-[color-mix(in_srgb,#e4a356_8%,var(--panel))] p-[17px]">
      <div className="flex items-center gap-[9px]">
        <span className="size-2 animate-pulse rounded-full bg-[#e4a356] shadow-[0_0_0_5px_#e4a35620]" />
        <strong>Codexの再認証が必要です</strong>
      </div>
      <a
        className="w-max font-semibold [text-decoration:none]!"
        href={auth.verificationUri}
        target="_blank"
        rel="noopener noreferrer"
      >
        認証ページを新しいタブで開く ↗
      </a>
      <button
        className="flex w-full cursor-pointer items-center justify-between rounded-[11px] border border-line bg-panel px-3 py-2.5 [&_svg]:w-4"
        type="button"
        aria-label="認証コードをコピー"
        title="認証コードをコピー"
        onClick={() => copy.copy(auth.userCode)}
      >
        <code>{auth.userCode}</code>
        {copy.copied ? <Check /> : <Copy />}
      </button>
    </div>
  );
}

export function FileBlocks({ files, alignEnd = false }: { files: FileItem[]; alignEnd?: boolean }) {
  const [preview, setPreview] = useState<FileItem | null>(null);
  const previewUrl = preview?.preview || (preview?.id ? `/files/${preview.id}` : "");
  return (
    <>
      <div
        className={`flex max-w-full flex-nowrap gap-[9px] overflow-x-auto pb-[5px] ${alignEnd ? "mb-2 justify-end" : "mt-3"}`}
      >
        {files.map((file) =>
          file.mime.startsWith("image/") && (file.id || file.preview) ? (
            <button
              key={file.id || file.name}
              className="shrink-0 cursor-zoom-in rounded-[14px] border-0 bg-transparent p-0 [&_img]:block [&_img]:h-auto [&_img]:max-h-[210px] [&_img]:max-w-80 [&_img]:rounded-[14px] [&_img]:border [&_img]:border-line [&_img]:object-cover [&_img]:shadow-[0_24px_70px_#4c392718] max-md:[&_img]:max-h-[170px] max-md:[&_img]:max-w-[260px] dark:[&_img]:shadow-[0_28px_80px_#100d0966]"
              onClick={() => setPreview(file)}
              aria-label={`${file.name}を拡大表示`}
            >
              <img src={file.preview || `/files/${file.id}`} alt={file.name} />
            </button>
          ) : (
            <a
              key={file.id || file.name}
              className="flex shrink-0 items-center gap-2 rounded-xl border border-line bg-panel px-3 py-[9px] [&_svg]:w-4 [&_svg]:text-accent"
              href={file.id ? `/files/${file.id}` : undefined}
              target="_blank"
            >
              <File />
              <span>{file.name}</span>
            </a>
          ),
        )}
      </div>
      <AnimatePresence>
        {preview && (
          <motion.button
            className="fixed inset-0 z-80 flex size-full cursor-zoom-out items-center justify-center border-0 bg-[#090a0dcc] p-7 backdrop-blur-[7px] [&_img]:block [&_img]:h-auto [&_img]:max-h-[calc(100dvh-56px)] [&_img]:w-auto [&_img]:max-w-[calc(100vw-56px)] [&_img]:object-contain"
            onClick={() => setPreview(null)}
            aria-label="拡大表示を閉じる"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <img src={previewUrl} alt={preview.name} />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}

export function Thinking() {
  const dotClass = "size-1.5 animate-bounce rounded-full bg-muted";
  return (
    <motion.div
      className="mb-7 flex gap-3.5 max-md:mb-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="flex h-[30px] items-center gap-[5px]">
        <i className={dotClass} />
        <i className={`${dotClass} [animation-delay:150ms]`} />
        <i className={`${dotClass} [animation-delay:300ms]`} />
      </div>
    </motion.div>
  );
}
