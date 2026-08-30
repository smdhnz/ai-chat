"use client";

import { memo, useDeferredValue, useEffect, useRef, useState, type ComponentProps } from "react";
import { motion } from "motion/react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, File, LoaderCircle, Pencil, RotateCcw, Sparkles } from "lucide-react";
import { parseDeviceAuth, type DeviceAuth, type FileItem, type Message } from "@/lib/api";
import { useCopy } from "@/app/(chat)/_hooks/use-copy";
import { ImageDialog } from "@/components/image-dialog";

export function MessageView({
  message,
  disabled,
  draft,
  regenerate,
  edit,
  prioritizeImages,
  finishStreaming,
}: {
  message: Message;
  disabled: boolean;
  draft?: string;
  regenerate: () => void;
  edit: () => void;
  prioritizeImages: boolean;
  finishStreaming?: () => void;
}) {
  const deferredDraft = useDeferredValue(draft);
  const sourceContent = draft === undefined ? message.content : (deferredDraft ?? draft);
  const auth = message.auth ?? parseDeviceAuth(sourceContent);
  const content = auth ? "" : sourceContent;
  const hasBody = Boolean(content || auth || message.skills?.length);
  const isUser = message.role === "user";
  const collapsible = isUser && content.length > 1200;
  const [expanded, setExpanded] = useState(false);
  const streaming = message.id.startsWith("stream-");
  return (
    <article className={`mb-6 flex gap-2.5 ${isUser ? "justify-end" : ""}`}>
      <div className={`flex min-w-0 max-w-[87%] flex-col ${isUser ? "items-end" : "items-start"}`}>
        {isUser && message.files?.length > 0 && (
          <FileBlocks files={message.files} alignEnd prioritizeImages={prioritizeImages} />
        )}
        {hasBody && (
          <>
            <div
              className={`min-w-0 max-w-full text-sm leading-[1.78] [&_a]:text-primary [&_a]:underline [&_code:not(pre_code)]:rounded-[5px] [&_code:not(pre_code)]:bg-muted [&_code:not(pre_code)]:px-[5px] [&_code:not(pre_code)]:py-0.5 [&_code:not(pre_code)]:text-[0.88em] [&_ol]:pl-5 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_ul]:pl-5 ${isUser ? "rounded-[20px] bg-[color-mix(in_srgb,var(--primary)_9%,var(--card))] px-4 py-[11px] shadow-[0_6px_20px_#1a1a1e1f]" : ""} ${collapsible && !expanded ? "max-h-56 overflow-hidden [mask-image:linear-gradient(#000_75%,transparent)]" : ""}`}
            >
              {message.skills && message.skills.length > 0 && (
                <div className="mb-2 flex items-center gap-1.5 text-[10px] text-primary [&_svg]:w-[13px]">
                  <Sparkles />
                  {message.skills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-md bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] px-[7px] py-[3px] text-[10px] text-primary"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              )}
              {streaming ? (
                <StreamingContent content={content} finish={finishStreaming} />
              ) : (
                <MarkdownContent content={content} />
              )}
              {auth && <AuthCard auth={auth} />}
            </div>
            {collapsible && (
              <button
                type="button"
                className="mt-[5px] h-auto px-[7px] py-1 text-[10px] text-muted-foreground"
                aria-expanded={expanded}
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? "一部表示に戻す" : "全文を表示"}
              </button>
            )}
          </>
        )}
        {!isUser && message.files?.length > 0 && (
          <FileBlocks files={message.files} prioritizeImages={prioritizeImages} />
        )}
        {isUser && (
          <div className="mt-1 flex w-full justify-end gap-0.5">
            <button
              type="button"
              className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-muted active:text-foreground disabled:opacity-40 [&_svg]:size-3.5"
              aria-label="このメッセージから再生成"
              disabled={disabled}
              onClick={regenerate}
            >
              <RotateCcw />
            </button>
            <button
              type="button"
              className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-muted active:text-foreground disabled:opacity-40 [&_svg]:size-3.5"
              aria-label="編集して再生成"
              disabled={disabled}
              onClick={edit}
            >
              <Pencil />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

export function CodeBlock(markdownProps: ComponentProps<"pre"> & MarkdownNode) {
  const { children, ...props } = withoutMarkdownNode(markdownProps);
  const copy = useCopy();
  const code = useRef<HTMLPreElement>(null);
  return (
    <div className="relative">
      <button
        className="absolute top-2 right-2 z-1 inline-flex size-7 items-center justify-center rounded-[7px] border border-border bg-card [&_svg]:size-3.5"
        type="button"
        aria-label="コードをコピー"
        onClick={() => copy.copy(code.current?.innerText ?? "")}
      >
        {copy.copied ? <Check /> : <Copy />}
      </button>
      <pre
        className="overflow-auto rounded-[14px] border border-border bg-muted py-4 pr-[52px] pl-4 text-xs leading-[1.6]"
        ref={code}
        {...props}
      >
        {children}
      </pre>
    </div>
  );
}

// react-markdown hands every renderer the source AST node, which must not reach
// the DOM element underneath.
type MarkdownNode = { node?: unknown };

function withoutMarkdownNode<T extends MarkdownNode>({ node, ...props }: T) {
  void node;
  return props;
}

const cellClass = "border border-border px-[9px] py-[7px] text-left whitespace-normal";

const markdownComponents: Components = {
  pre: CodeBlock,
  table: (props) => (
    <table className="w-full border-collapse text-xs" {...withoutMarkdownNode(props)} />
  ),
  thead: (props) => <thead {...withoutMarkdownNode(props)} />,
  tbody: (props) => <tbody {...withoutMarkdownNode(props)} />,
  tr: (props) => <tr {...withoutMarkdownNode(props)} />,
  th: (props) => <th className={cellClass} {...withoutMarkdownNode(props)} />,
  td: (props) => <td className={cellClass} {...withoutMarkdownNode(props)} />,
};

function StreamingContent({ content, finish }: { content: string; finish?: () => void }) {
  const target = useRef("");
  const displayed = useRef("");
  const nextId = useRef(0);
  const [chunks, setChunks] = useState<{ id: number; text: string }[]>([]);

  useEffect(() => {
    if (!content.startsWith(target.current)) {
      displayed.current = "";
      setChunks([]);
    }
    target.current = content;
  }, [content]);

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = target.current.slice(displayed.current.length);
      if (!remaining) return;
      const text = remaining.slice(0, 1);
      displayed.current += text;
      const chunk = { id: nextId.current++, text };
      setChunks((value) => [...value, chunk]);
    }, 30);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (finish && displayed.current === target.current) finish();
  }, [chunks, finish]);

  return (
    <div className="whitespace-pre-wrap">
      {chunks.map((chunk) => (
        <motion.span
          key={chunk.id}
          initial={{ opacity: 0.5 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          {chunk.text}
        </motion.span>
      ))}
    </div>
  );
}

const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {content}
    </ReactMarkdown>
  );
});

export function AuthCard({ auth }: { auth: DeviceAuth }) {
  const copy = useCopy();
  return (
    <div className="mt-[15px] flex flex-col gap-2.5 rounded-[17px] border border-[color-mix(in_srgb,var(--warning)_38%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_8%,var(--card))] p-[17px]">
      <div className="flex items-center gap-[9px]">
        <LoaderCircle className="size-4 animate-spin text-warning" aria-label="認証待ち" />
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
        className="flex h-auto w-full items-center justify-between rounded-[11px] border border-border bg-card px-3 py-2.5 [&_svg]:size-4"
        type="button"
        aria-label="認証コードをコピー"
        onClick={() => copy.copy(auth.userCode)}
      >
        <code>{auth.userCode}</code>
        {copy.copied ? <Check /> : <Copy />}
      </button>
    </div>
  );
}

function ChatImage({
  file,
  priority,
  open,
}: {
  file: FileItem;
  priority: boolean;
  open: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <button
      className={`shrink-0 cursor-zoom-in overflow-hidden rounded-[14px] border border-border p-0 shadow-[0_24px_70px_#1a1a1e1f] dark:shadow-[0_28px_80px_#00000066] ${loaded ? "bg-transparent" : "min-h-24 min-w-32 animate-pulse bg-muted"}`}
      onClick={open}
      aria-label={`${file.name}を拡大表示`}
      aria-busy={!loaded}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={`block h-auto max-h-[170px] max-w-[260px] rounded-[13px] object-cover transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
        src={file.preview || `/files/${file.id}`}
        alt={file.name}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "low"}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
      />
    </button>
  );
}

export function FileBlocks({
  files,
  alignEnd = false,
  prioritizeImages,
}: {
  files: FileItem[];
  alignEnd?: boolean;
  prioritizeImages: boolean;
}) {
  const [preview, setPreview] = useState<FileItem | null>(null);
  const previewUrl = preview?.preview || (preview?.id ? `/files/${preview.id}` : "");
  return (
    <>
      <div
        className={`max-w-full overflow-x-auto overscroll-x-contain ${alignEnd ? "mb-2" : "mt-3"}`}
      >
        <div className="flex w-max flex-nowrap items-start gap-[9px]">
          {files.map((file) =>
            file.mime.startsWith("image/") && (file.id || file.preview) ? (
              <ChatImage
                key={file.id || file.name}
                file={file}
                priority={prioritizeImages}
                open={() => setPreview(file)}
              />
            ) : (
              <a
                key={file.id || file.name}
                href={file.id ? `/files/${file.id}` : undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-auto shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-3 py-[9px] [&_svg]:size-4 [&_svg]:text-primary"
              >
                <File />
                <span>{file.name}</span>
              </a>
            ),
          )}
        </div>
      </div>
      <ImageDialog
        open={Boolean(preview)}
        onOpenChange={(open) => !open && setPreview(null)}
        src={previewUrl}
        name={preview?.name ?? "image"}
        downloadUrl={preview?.id ? `/files/${preview.id}?download=1` : previewUrl}
      />
    </>
  );
}

export function Thinking() {
  return (
    <motion.div className="mb-6 flex gap-3.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex h-[30px] items-center">
        <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-label="生成中" />
      </div>
    </motion.div>
  );
}
