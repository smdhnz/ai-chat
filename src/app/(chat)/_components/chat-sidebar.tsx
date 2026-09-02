"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Check, Settings, SquarePen, Trash2, UsersRound } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Bootstrap, Conversation } from "@/lib/api";
import { iconButtonClass } from "@/lib/ui";

const rowButtonClass =
  "flex h-[41px] min-w-0 flex-1 items-center gap-2.5 rounded-[11px] px-[11px] text-left text-xs text-muted-foreground transition duration-200 hover:text-foreground [&>svg]:size-[15px] [&>svg]:shrink-0";

function ConversationRow({
  item,
  active,
  select,
  remove,
}: {
  item: Conversation;
  active: boolean;
  select: () => void;
  remove?: () => void;
}) {
  return (
    <li
      className={`flex items-center rounded-[11px] hover:bg-sidebar-accent ${active ? "bg-[color-mix(in_srgb,var(--primary)_11%,var(--card))] text-foreground" : ""}`}
    >
      <button type="button" className={rowButtonClass} onClick={select} aria-current={active}>
        <span className="truncate">{item.title}</span>
        {item.unread === 1 && !active && (
          <span
            role="status"
            aria-label="新しい応答"
            className="size-[7px] shrink-0 rounded-full bg-primary"
          />
        )}
      </button>
      {remove ? (
        <button
          type="button"
          className="mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-muted active:text-destructive [&_svg]:size-3.5"
          aria-label={`${item.title}を削除`}
          onClick={remove}
        >
          <Trash2 />
        </button>
      ) : null}
    </li>
  );
}

export function ChatSidebar({
  open,
  onOpenChange,
  data,
  conversationId,
  projectId,
  newChat,
  selectConversation,
  askDeleteConversation,
  openSettings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: Bootstrap;
  conversationId: string | null;
  projectId: string;
  newChat: (projectId: string, temporary?: boolean, closeSidebar?: boolean) => void;
  selectConversation: (item: Conversation) => void;
  askDeleteConversation: (item: Conversation) => void;
  openSettings: () => void;
}) {
  const [conversationLimit, setConversationLimit] = useState(10);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && onOpenChange(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open, onOpenChange]);

  const project = data.projects.find((item) => item.id === projectId);
  const conversations = data.conversations.filter(
    (item) =>
      !item.temporary && (projectId ? item.project_id === projectId : item.project_id === null),
  );
  const canDelete = project ? project.is_owner : true;

  return (
    <div
      inert={!open ? true : undefined}
      className={`absolute inset-0 transition-opacity duration-200 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
    >
      <div className="size-full">
        <aside className="flex h-full w-[86vw] flex-col bg-sidebar text-sidebar-foreground">
          <div className="flex h-[92px] shrink-0 items-center justify-center">
            <Image
              src="/favicon.svg?v=3"
              width={48}
              height={48}
              alt=""
              className="pointer-events-none size-12 [-webkit-touch-callout:none] [-webkit-user-drag:none]"
              draggable={false}
              unoptimized
            />
          </div>
          <section className="shrink-0 px-3.5 pb-3" aria-labelledby="project-list-title">
            <h2
              id="project-list-title"
              className="px-[11px] pb-1.5 text-[10px] font-semibold text-muted-foreground"
            >
              プロジェクト
            </h2>
            <div className="max-h-36 overflow-y-auto">
              <button
                type="button"
                aria-pressed={!project}
                className={`flex h-10 w-full items-center gap-2 rounded-[11px] px-[11px] text-left text-xs transition-colors ${!project ? "bg-sidebar-accent text-sidebar-foreground" : "text-muted-foreground"}`}
                onClick={() => newChat("", false, false)}
              >
                <span className="min-w-0 flex-1 truncate">プロジェクトなし</span>
                {!project ? <Check className="size-3.5 shrink-0 text-primary" /> : null}
              </button>
              {data.projects.map((item) => (
                <button
                  type="button"
                  aria-pressed={item.id === projectId}
                  key={item.id}
                  className={`flex h-10 w-full items-center gap-2 rounded-[11px] px-[11px] text-left text-xs transition-colors ${item.id === projectId ? "bg-sidebar-accent text-sidebar-foreground" : "text-muted-foreground"}`}
                  onClick={() => newChat(item.id, false, false)}
                >
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  {item.shared ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[9px] text-primary">
                      <UsersRound className="size-3" />
                      共有
                    </span>
                  ) : null}
                  {item.id === projectId ? (
                    <Check className="size-3.5 shrink-0 text-primary" />
                  ) : null}
                </button>
              ))}
            </div>
          </section>
          <div className="flex h-8 shrink-0 items-center px-6 text-[11px] font-semibold text-muted-foreground">
            チャット
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto px-3.5" aria-label="チャット一覧">
            <AnimatePresence initial={false} mode="wait">
              <motion.ul
                key={projectId}
                className="flex flex-col"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
              >
                {conversations.slice(0, conversationLimit).map((item) => (
                  <ConversationRow
                    key={item.id}
                    item={item}
                    active={item.id === conversationId}
                    select={() => selectConversation(item)}
                    remove={canDelete ? () => askDeleteConversation(item) : undefined}
                  />
                ))}
                {conversations.length > conversationLimit && (
                  <li>
                    <button
                      type="button"
                      className="h-8 w-full px-[11px] text-left text-[11px] text-muted-foreground"
                      onClick={() => setConversationLimit((current) => current + 10)}
                    >
                      もっと見る
                    </button>
                  </li>
                )}
              </motion.ul>
            </AnimatePresence>
          </nav>
          <footer className="flex justify-between px-10 pt-2.5 pb-10">
            <button
              type="button"
              className={`${iconButtonClass} inline-flex items-center justify-center`}
              aria-label={project ? `${project.name}で新しいチャット` : "新しいチャット"}
              onClick={() => newChat(projectId)}
            >
              <SquarePen />
            </button>
            <button
              type="button"
              className={`${iconButtonClass} inline-flex items-center justify-center`}
              aria-label="設定を開く"
              onClick={openSettings}
            >
              <Settings />
            </button>
          </footer>
        </aside>
      </div>
    </div>
  );
}
