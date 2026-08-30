"use client";

import { useRef, useState, type ComponentProps } from "react";
import { motion } from "motion/react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Check,
  Copy,
  File,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { parseDeviceAuth, type DeviceAuth, type FileItem, type Message } from "@/lib/api";
import { ease } from "@/lib/ui";
import { useCopy } from "@/app/(chat)/_hooks/use-copy";
import { NativeDialog } from "@/components/native-dialog";

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
      className={`mb-6 flex gap-2.5 ${isUser ? "justify-end" : ""}`}
      initial={{ opacity: 0, y: 14, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.38, ease }}
    >
      <div className={`flex min-w-0 max-w-[87%] flex-col items-start ${isUser ? "items-end" : ""}`}>
        {isUser && message.files?.length > 0 && <FileBlocks files={message.files} alignEnd />}
        {hasBody && (
          <>
            <div
              className={`min-w-0 max-w-full text-[13px] leading-[1.78] [&_a]:text-primary [&_a]:underline [&_code:not(pre_code)]:rounded-[5px] [&_code:not(pre_code)]:bg-muted [&_code:not(pre_code)]:px-[5px] [&_code:not(pre_code)]:py-0.5 [&_code:not(pre_code)]:text-[0.88em] [&_ol]:pl-5 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_ul]:pl-5 ${isUser ? "rounded-[20px_20px_6px_20px] border border-[color-mix(in_srgb,var(--primary)_16%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_9%,var(--card))] px-4 py-[11px] shadow-[0_6px_20px_#5b403010]" : ""} ${collapsible && !expanded ? "max-h-56 overflow-hidden [mask-image:linear-gradient(#000_75%,transparent)]" : ""}`}
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
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {content}
              </ReactMarkdown>
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
        {!isUser && message.files?.length > 0 && <FileBlocks files={message.files} />}
        {isUser && (
          <details className="relative mt-[3px] self-end">
            <summary
              className={`inline-flex size-7 cursor-pointer list-none items-center justify-center rounded-lg text-muted-foreground [&_svg]:size-3.5 ${disabled ? "pointer-events-none opacity-50" : ""}`}
              aria-label="このメッセージの操作"
            >
              <MoreHorizontal />
            </summary>
            <div className="absolute top-full right-0 z-10 flex min-w-[190px] flex-col rounded-[13px] border border-border bg-popover p-1 shadow-lg">
              <button
                type="button"
                className="flex items-center gap-2 rounded-[9px] px-2 py-1.5 text-left text-xs [&_svg]:size-4"
                onClick={regenerate}
              >
                <RotateCcw />
                このメッセージから再生成
              </button>
              <button
                type="button"
                className="flex items-center gap-2 rounded-[9px] px-2 py-1.5 text-left text-xs [&_svg]:size-4"
                onClick={edit}
              >
                <Pencil />
                編集して再生成
              </button>
            </div>
          </details>
        )}
      </div>
    </motion.article>
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

export function AuthCard({ auth }: { auth: DeviceAuth }) {
  const copy = useCopy();
  return (
    <div className="mt-[15px] flex flex-col gap-2.5 rounded-[17px] border border-[color-mix(in_srgb,#e4a356_38%,var(--border))] bg-[color-mix(in_srgb,#e4a356_8%,var(--card))] p-[17px]">
      <div className="flex items-center gap-[9px]">
        <LoaderCircle className="size-4 animate-spin text-[#e4a356]" aria-label="認証待ち" />
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

export function FileBlocks({ files, alignEnd = false }: { files: FileItem[]; alignEnd?: boolean }) {
  const [preview, setPreview] = useState<FileItem | null>(null);
  const previewUrl = preview?.preview || (preview?.id ? `/files/${preview.id}` : "");
  return (
    <>
      <div
        className={`max-w-full overflow-x-auto overscroll-x-contain ${alignEnd ? "mb-2" : "mt-3"}`}
      >
        <div className="flex w-max flex-nowrap gap-[9px] pb-[5px]">
          {files.map((file) =>
            file.mime.startsWith("image/") && (file.id || file.preview) ? (
              <button
                key={file.id || file.name}
                className="shrink-0 cursor-zoom-in rounded-[14px] border-0 bg-transparent p-0 [&_img]:block [&_img]:h-auto [&_img]:max-h-[170px] [&_img]:max-w-[260px] [&_img]:rounded-[14px] [&_img]:border [&_img]:border-border [&_img]:object-cover [&_img]:shadow-[0_24px_70px_#4c392718] dark:[&_img]:shadow-[0_28px_80px_#100d0966]"
                onClick={() => setPreview(file)}
                aria-label={`${file.name}を拡大表示`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={file.preview || `/files/${file.id}`} alt={file.name} />
              </button>
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
      <NativeDialog
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        label={preview?.name ?? "拡大表示"}
        className="fixed inset-0 size-full cursor-zoom-out"
      >
        <div
          className="flex size-full items-center justify-center p-7"
          onClick={() => setPreview(null)}
        >
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="block h-auto max-h-[calc(100dvh-56px)] w-auto max-w-[calc(100vw-56px)] object-contain"
              src={previewUrl}
              alt={preview.name}
            />
          )}
        </div>
      </NativeDialog>
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
