"use client";

import { memo, useDeferredValue, useEffect, useRef, useState, type ComponentProps } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Check,
  ChevronDown,
  CircleX,
  Copy,
  File,
  LoaderCircle,
  Pencil,
  RotateCcw,
} from "lucide-react";
import {
  parseDeviceAuth,
  type DeviceAuth,
  type FileItem,
  type Message,
  type PublicActivity,
} from "@/lib/api";
import { useCopy } from "@/app/(chat)/_hooks/use-copy";
import { ImageDialog } from "@/components/image-dialog";
import { LoadingWave } from "@/components/loading-wave";

export function MessageView({
  message,
  disabled,
  draft,
  regenerate,
  edit,
  shared,
  prioritizeImages,
  finishStreaming,
}: {
  message: Message;
  disabled: boolean;
  draft?: string;
  regenerate: () => void;
  edit: () => void;
  shared: boolean;
  prioritizeImages: boolean;
  finishStreaming?: () => void;
}) {
  const deferredDraft = useDeferredValue(draft);
  const sourceContent = draft === undefined ? message.content : (deferredDraft ?? draft);
  const auth = message.auth ?? parseDeviceAuth(sourceContent);
  const content = auth ? "" : sourceContent;
  const hasBody = Boolean(content || auth || message.activities?.length);
  const isUser = message.role === "user";
  const collapsible = isUser && content.length > 1200;
  const [expanded, setExpanded] = useState(false);
  const copy = useCopy();
  const streaming = message.id.startsWith("stream-");
  return (
    <article className={`mb-6 flex gap-2.5 ${isUser ? "justify-end" : ""}`}>
      <div className={`flex min-w-0 max-w-[87%] flex-col ${isUser ? "items-end" : "items-start"}`}>
        {isUser && shared && message.author ? (
          <span className="mb-1 px-1 text-[10px] text-muted-foreground">
            {message.author.display_name}
          </span>
        ) : null}
        {isUser && message.files?.length > 0 && (
          <FileBlocks files={message.files} alignEnd prioritizeImages={prioritizeImages} />
        )}
        {hasBody && (
          <>
            <div
              className={`min-w-0 max-w-full text-sm leading-[1.78] [&_a]:text-primary [&_a]:underline [&_code:not(pre_code)]:rounded-[5px] [&_code:not(pre_code)]:bg-muted [&_code:not(pre_code)]:px-[5px] [&_code:not(pre_code)]:py-0.5 [&_code:not(pre_code)]:text-[0.88em] [&_ol]:pl-5 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_ul]:pl-5 ${isUser ? "rounded-[20px] bg-[color-mix(in_srgb,var(--primary)_9%,var(--card))] px-4 py-[11px] shadow-[0_6px_20px_#1a1a1e1f]" : ""} ${collapsible && !expanded ? "max-h-56 overflow-hidden [mask-image:linear-gradient(#000_75%,transparent)]" : ""}`}
            >
              {!isUser && message.activities && message.activities.length > 0 && (
                <ActivityPanel activities={message.activities} streaming={streaming} />
              )}
              {isUser ? (
                <div className="break-words whitespace-pre-wrap">{content}</div>
              ) : streaming ? (
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
        {(sourceContent || isUser) && (
          <div className={`mt-1 flex w-full gap-0.5 ${isUser ? "justify-end" : "justify-start"}`}>
            {sourceContent && (
              <button
                type="button"
                className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-muted active:text-foreground [&_svg]:size-3.5"
                aria-label="メッセージ全体をコピー"
                onClick={() => copy.copy(sourceContent)}
              >
                {copy.copied ? <Check /> : <Copy />}
              </button>
            )}
            {isUser && (
              <>
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
              </>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function ActivityPanel({
  activities,
  streaming,
}: {
  activities: PublicActivity[];
  streaming: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const reducedMotion = useReducedMotion();
  const latest = activities.at(-1);
  return (
    <div className="mb-3 w-fit max-w-[min(280px,78vw)]">
      <button
        type="button"
        className="flex min-h-11 max-w-full items-center gap-2 text-left text-[9px] text-muted-foreground"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        {streaming && latest ? <LoadingWave className="shrink-0 text-sm text-primary" /> : null}
        <span
          className={`min-w-0 flex-1 break-words ${streaming && latest ? "activity-shimmer" : "opacity-70"}`}
        >
          {streaming && latest ? activityLabel(latest) : `${activities.length}件の処理`}
        </span>
        <motion.span
          className="shrink-0 opacity-50"
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.18 }}
        >
          <ChevronDown className="size-3" aria-hidden="true" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="activity-details"
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.2, ease: "easeOut" }}
          >
            <div className="space-y-2 pt-1 pl-[1.85rem] text-[10px] leading-[1.55] text-muted-foreground/60">
              {activities.map((activity, index) => (
                <div key={`${activity.type}-${index}`}>
                  <div className="flex items-start gap-2">
                    <span
                      className={
                        activity.type === "reasoning" ? "shrink-0" : "min-w-0 flex-1 break-words"
                      }
                    >
                      {activityLabel(activity)}
                    </span>
                    {activity.type === "reasoning" ? (
                      <span className="min-w-0 flex-1 break-words whitespace-normal">
                        {activity.text}
                      </span>
                    ) : null}
                    <ActivityStatusIcon activity={activity} />
                  </div>
                  {activity.type === "tool" && (
                    <p className="mt-0.5 break-words">{activity.summary}</p>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function activityLabel(activity: PublicActivity): string {
  if (activity.type === "reasoning") return "思考";
  if (activity.type === "web_search")
    return `${activity.query ? `Web検索: ${activity.query}` : "Web検索"} · 参照${activity.sources.length}件`;
  if (activity.type === "image_generation")
    return activity.operation === "edit" ? "画像を編集" : "画像を生成";
  if (activity.type === "skill") return `${activity.name}を読み込み`;
  if (activity.name === "context_compaction") return "会話履歴を整理";
  if (activity.name === "run") return "応答処理";
  return activity.name === "inspect_image" ? "画像を確認" : activity.name;
}

function ActivityStatusIcon({ activity }: { activity: PublicActivity }) {
  if (activity.type === "reasoning" || activity.status === "completed")
    return (
      <span
        className="shrink-0 opacity-70"
        role="img"
        aria-label={activity.type === "reasoning" ? "記録済み" : "完了"}
      >
        <Check className="size-3" aria-hidden="true" />
      </span>
    );
  if (activity.status === "running")
    return (
      <span className="shrink-0 opacity-70" role="img" aria-label="処理中">
        <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
      </span>
    );
  return (
    <span className="shrink-0 text-destructive/70" role="img" aria-label="失敗">
      <CircleX className="size-3" aria-hidden="true" />
    </span>
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
  const deferred = useDeferredValue(content);
  useEffect(() => {
    if (finish && deferred === content) finish();
  }, [content, deferred, finish]);
  return <MarkdownContent content={deferred} />;
}

const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="message-text">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
});

export function AuthCard({ auth }: { auth: DeviceAuth }) {
  const copy = useCopy();
  return (
    <div className="mt-[15px] flex flex-col gap-2.5 rounded-[17px] border border-[color-mix(in_srgb,var(--warning)_38%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_8%,var(--card))] p-[17px]">
      <div className="flex items-center gap-[9px]">
        <LoadingWave className="text-base text-warning" label="認証待ち" />
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
  const [loaded, setLoaded] = useState(Boolean(file.preview));
  const source = file.preview || `/files/${file.id}`;
  return (
    <button
      type="button"
      className="relative shrink-0 cursor-zoom-in overflow-hidden rounded-[14px] border border-border bg-transparent p-0"
      aria-label={`${file.name}を表示`}
      onClick={open}
    >
      {!file.preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="block h-auto max-h-[170px] max-w-[260px] rounded-[13px] object-cover"
          src={`/files/${file.id}?preview`}
          alt=""
        />
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={`${file.preview ? "block" : "absolute inset-0 size-full"} rounded-[13px] object-cover transition-opacity duration-300 motion-reduce:transition-none ${loaded ? "opacity-100" : "opacity-0"}`}
        src={source}
        alt=""
        loading="lazy"
        fetchPriority={priority ? "high" : "low"}
        onLoad={() => setLoaded(true)}
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
      />
    </>
  );
}

export function Thinking() {
  return (
    <motion.div className="mb-6 flex gap-3.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex h-[30px] items-center">
        <LoadingWave className="text-lg text-muted-foreground" label="生成中" />
      </div>
    </motion.div>
  );
}
