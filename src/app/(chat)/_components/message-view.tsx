"use client";

import { memo, useDeferredValue, useEffect, useRef, useState, type ComponentProps } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Brain,
  Check,
  ChevronDown,
  Copy,
  File,
  ImageIcon,
  Pencil,
  RotateCcw,
  Search,
  Sparkles,
  Wrench,
} from "lucide-react";
import {
  parseDeviceAuth,
  type DeviceAuth,
  type FileItem,
  type Message,
  type PublicActivity,
} from "@/lib/api";
import { useCopy } from "@/app/(chat)/_hooks/use-copy";
import { LoadingWave } from "@/components/loading-wave";

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
  const hasBody = Boolean(content || auth || message.skills?.length || message.activities?.length);
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
              {!isUser && message.activities && message.activities.length > 0 && (
                <ActivityPanel activities={message.activities} streaming={streaming} />
              )}
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
    <div className="mb-3 w-fit min-w-[min(180px,78vw)] max-w-[min(280px,78vw)] rounded-[13px] border border-border bg-[color-mix(in_srgb,var(--muted)_62%,transparent)] text-xs">
      <button
        type="button"
        className="flex h-auto w-full items-center gap-2 px-3 py-2.5 text-left text-muted-foreground"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        {streaming && latest && latest.type !== "reasoning" ? (
          <LoadingWave className="shrink-0 text-sm" />
        ) : (
          <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1 truncate">
          {streaming && latest ? activityLabel(latest) : `${activities.length}件の処理`}
        </span>
        <motion.span
          className="shrink-0"
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.18 }}
        >
          <ChevronDown className="size-3.5" aria-hidden="true" />
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
            <div className="border-t border-border px-3 py-1.5">
              {activities.map((activity, index) => (
                <div
                  key={`${activity.type}-${index}`}
                  className="flex gap-2 border-b border-border/60 py-2.5 last:border-b-0"
                >
                  <span className="mt-0.5 text-muted-foreground">{activityIcon(activity)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 break-words font-medium text-foreground">
                        {activityLabel(activity)}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {activityStatus(activity)}
                      </span>
                    </div>
                    {activity.type === "reasoning" && (
                      <p className="mt-1 break-words whitespace-pre-wrap text-muted-foreground">
                        {activity.text}
                      </p>
                    )}
                    {activity.type === "web_search" && activity.sources.length > 0 && (
                      <ul className="mt-1 space-y-1">
                        {activity.sources.map((source) => (
                          <li key={source.url} className="break-words">
                            <a href={source.url} target="_blank" rel="noopener noreferrer">
                              {source.title || source.url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                    {activity.type === "tool" && (
                      <p className="mt-1 break-words text-muted-foreground">{activity.summary}</p>
                    )}
                  </div>
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
  if (activity.type === "reasoning") return "思考の要約";
  if (activity.type === "skill") return `${activity.name}を読み込み`;
  if (activity.type === "web_search")
    return activity.query ? `Web検索: ${activity.query}` : "Web検索";
  if (activity.type === "image_generation")
    return activity.operation === "edit" ? "画像を編集" : "画像を生成";
  if (activity.name === "context_compaction") return "会話履歴を整理";
  if (activity.name === "run") return "応答処理";
  return activity.name === "inspect_image" ? "画像を確認" : activity.name;
}

function activityStatus(activity: PublicActivity): string {
  if (activity.type === "reasoning") return "記録済み";
  if (activity.status === "running") return "処理中";
  return activity.status === "error" ? "失敗" : "完了";
}

function activityIcon(activity: PublicActivity) {
  if (activity.type === "reasoning") return <Brain className="size-3.5" aria-hidden="true" />;
  if (activity.type === "skill") return <Sparkles className="size-3.5" aria-hidden="true" />;
  if (activity.type === "web_search") return <Search className="size-3.5" aria-hidden="true" />;
  if (activity.type === "image_generation")
    return <ImageIcon className="size-3.5" aria-hidden="true" />;
  return <Wrench className="size-3.5" aria-hidden="true" />;
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

function ChatImage({ file, priority }: { file: FileItem; priority: boolean }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div
      className={`shrink-0 overflow-hidden rounded-[14px] border border-border shadow-[0_24px_70px_#1a1a1e1f] dark:shadow-[0_28px_80px_#00000066] ${loaded ? "bg-transparent" : "min-h-24 min-w-32 animate-pulse bg-muted"}`}
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
    </div>
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
  return (
    <div
      className={`max-w-full overflow-x-auto overscroll-x-contain ${alignEnd ? "mb-2" : "mt-3"}`}
    >
      <div className="flex w-max flex-nowrap items-start gap-[9px]">
        {files.map((file) =>
          file.mime.startsWith("image/") && (file.id || file.preview) ? (
            <ChatImage key={file.id || file.name} file={file} priority={prioritizeImages} />
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
