"use client";

import { useRef, useState, type ComponentProps } from "react";
import { motion } from "motion/react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, File, MoreHorizontal, Pencil, RotateCcw, Sparkles } from "lucide-react";
import { parseDeviceAuth, type DeviceAuth, type FileItem, type Message } from "@/lib/api";
import { ease } from "@/lib/ui";
import { useCopy } from "@/lib/use-copy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
              className={`min-w-0 max-w-full text-sm leading-[1.78] max-md:text-[13px] [&_a]:text-primary [&_a]:underline [&_code:not(pre_code)]:rounded-[5px] [&_code:not(pre_code)]:bg-muted [&_code:not(pre_code)]:px-[5px] [&_code:not(pre_code)]:py-0.5 [&_code:not(pre_code)]:text-[0.88em] [&_ol]:pl-5 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_ul]:pl-5 ${isUser ? "rounded-[20px_20px_6px_20px] border border-[color-mix(in_srgb,var(--primary)_16%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_9%,var(--card))] px-4 py-[11px] shadow-[0_6px_20px_#5b403010]" : ""} ${collapsible && !expanded ? "max-h-56 overflow-hidden [mask-image:linear-gradient(#000_75%,transparent)]" : ""}`}
            >
              {message.skills && message.skills.length > 0 && (
                <div className="mb-2 flex items-center gap-1.5 text-[10px] text-primary [&_svg]:w-[13px]">
                  <Sparkles />
                  {message.skills.map((skill) => (
                    <Badge
                      key={skill}
                      className="bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] px-[7px] py-[3px] text-[10px] font-normal text-primary"
                    >
                      {skill}
                    </Badge>
                  ))}
                </div>
              )}
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {content}
              </ReactMarkdown>
              {auth && <AuthCard auth={auth} />}
            </div>
            {collapsible && (
              <Button
                variant="ghost"
                className="mt-[5px] h-auto px-[7px] py-1 text-[10px] font-normal text-muted-foreground hover:bg-transparent"
                aria-expanded={expanded}
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? "一部表示に戻す" : "全文を表示"}
              </Button>
            )}
          </>
        )}
        {!isUser && message.files?.length > 0 && <FileBlocks files={message.files} />}
        {isUser && (
          <div className="mt-[3px] flex self-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled={disabled}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 rounded-lg text-muted-foreground [&_svg:not([class*='size-'])]:size-3.5"
                  aria-label="このメッセージの操作"
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[190px] rounded-[13px]">
                <DropdownMenuItem className="rounded-[9px] text-xs" onSelect={regenerate}>
                  <RotateCcw />
                  このメッセージから再生成
                </DropdownMenuItem>
                <DropdownMenuItem className="rounded-[9px] text-xs" onSelect={edit}>
                  <Pencil />
                  編集して再生成
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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
      <Button
        variant="outline"
        size="icon-sm"
        className="absolute top-2 right-2 z-1 size-7 rounded-[7px] bg-card [&_svg:not([class*='size-'])]:size-3.5"
        type="button"
        aria-label="コードをコピー"
        onClick={() => copy.copy(code.current?.innerText ?? "")}
      >
        {copy.copied ? <Check /> : <Copy />}
      </Button>
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
    <Table className="w-full border-collapse text-xs" {...withoutMarkdownNode(props)} />
  ),
  thead: (props) => <TableHeader className="[&_tr]:border-b-0" {...withoutMarkdownNode(props)} />,
  tbody: (props) => <TableBody {...withoutMarkdownNode(props)} />,
  tr: (props) => (
    <TableRow className="border-b-0 hover:bg-transparent" {...withoutMarkdownNode(props)} />
  ),
  th: (props) => <TableHead className={`h-auto ${cellClass}`} {...withoutMarkdownNode(props)} />,
  td: (props) => <TableCell className={cellClass} {...withoutMarkdownNode(props)} />,
};

export function AuthCard({ auth }: { auth: DeviceAuth }) {
  const copy = useCopy();
  return (
    <Card className="mt-[15px] gap-2.5 rounded-[17px] border-[color-mix(in_srgb,#e4a356_38%,var(--border))] bg-[color-mix(in_srgb,#e4a356_8%,var(--card))] p-[17px] shadow-none">
      <div className="flex items-center gap-[9px]">
        <Spinner className="size-4 text-[#e4a356]" aria-label="認証待ち" />
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
      <Button
        variant="outline"
        className="h-auto w-full justify-between rounded-[11px] bg-card px-3 py-2.5 font-normal [&_svg:not([class*='size-'])]:size-4"
        type="button"
        aria-label="認証コードをコピー"
        onClick={() => copy.copy(auth.userCode)}
      >
        <code>{auth.userCode}</code>
        {copy.copied ? <Check /> : <Copy />}
      </Button>
    </Card>
  );
}

export function FileBlocks({ files, alignEnd = false }: { files: FileItem[]; alignEnd?: boolean }) {
  const [preview, setPreview] = useState<FileItem | null>(null);
  const previewUrl = preview?.preview || (preview?.id ? `/files/${preview.id}` : "");
  return (
    <>
      <ScrollArea
        scrollBars="horizontal"
        className={`max-w-full ${alignEnd ? "mb-2" : "mt-3"}`}
        viewportProps={{ className: "overscroll-x-contain" }}
      >
        <div className="flex w-max flex-nowrap gap-[9px] pb-[5px]">
          {files.map((file) =>
            file.mime.startsWith("image/") && (file.id || file.preview) ? (
              <button
                key={file.id || file.name}
                className="shrink-0 cursor-zoom-in rounded-[14px] border-0 bg-transparent p-0 [&_img]:block [&_img]:h-auto [&_img]:max-h-[210px] [&_img]:max-w-80 [&_img]:rounded-[14px] [&_img]:border [&_img]:border-border [&_img]:object-cover [&_img]:shadow-[0_24px_70px_#4c392718] max-md:[&_img]:max-h-[170px] max-md:[&_img]:max-w-[260px] dark:[&_img]:shadow-[0_28px_80px_#100d0966]"
                onClick={() => setPreview(file)}
                aria-label={`${file.name}を拡大表示`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={file.preview || `/files/${file.id}`} alt={file.name} />
              </button>
            ) : (
              <Button
                key={file.id || file.name}
                asChild
                variant="outline"
                className="h-auto shrink-0 gap-2 rounded-xl bg-card px-3 py-[9px] font-normal [&_svg:not([class*='size-'])]:size-4 [&_svg]:text-primary"
              >
                <a href={file.id ? `/files/${file.id}` : undefined} target="_blank">
                  <File />
                  <span>{file.name}</span>
                </a>
              </Button>
            ),
          )}
        </div>
      </ScrollArea>
      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent
          showCloseButton={false}
          overlayClassName="bg-transparent"
          className="top-0 left-0 flex size-full max-w-none translate-x-0 translate-y-0 sm:max-w-none cursor-zoom-out items-center justify-center rounded-none border-0 bg-[#090a0dcc] p-7 shadow-none backdrop-blur-[7px] [&_img]:block [&_img]:h-auto [&_img]:max-h-[calc(100dvh-56px)] [&_img]:w-auto [&_img]:max-w-[calc(100vw-56px)] [&_img]:object-contain"
          onClick={() => setPreview(null)}
        >
          <DialogTitle className="sr-only">{preview?.name ?? "拡大表示"}</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview && <img src={previewUrl} alt={preview.name} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function Thinking() {
  return (
    <motion.div
      className="mb-7 flex gap-3.5 max-md:mb-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="flex h-[30px] items-center">
        <Spinner className="size-4 text-muted-foreground" aria-label="生成中" />
      </div>
    </motion.div>
  );
}
