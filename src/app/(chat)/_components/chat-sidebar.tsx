"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, MessageSquare, Plus, Settings, Trash2 } from "lucide-react";
import type { Bootstrap, Conversation, Project } from "@/lib/api";
import { ProjectIcon } from "@/components/project-icon";
import { NativeDialog } from "@/components/native-dialog";

const rowButtonClass =
  "flex h-[41px] min-w-0 flex-1 items-center gap-2.5 rounded-[11px] px-[11px] text-left text-xs text-muted-foreground transition duration-200 hover:text-foreground [&>svg]:size-[15px] [&>svg]:shrink-0";
const rowActionClass =
  "inline-flex h-[41px] w-[30px] shrink-0 items-center justify-center rounded-[11px] text-muted-foreground hover:text-foreground [&_svg]:size-[15px]";
const openProjectsKey = "ai-chat:open-projects:v1";

function ConversationRow({
  item,
  active,
  nested = false,
  select,
  remove,
}: {
  item: Conversation;
  active: boolean;
  nested?: boolean;
  select: () => void;
  remove: () => void;
}) {
  return (
    <li
      className={`flex items-center rounded-[11px] hover:bg-sidebar-accent ${nested ? "pl-5" : ""} ${active ? "bg-[color-mix(in_srgb,var(--primary)_11%,var(--card))] text-foreground" : ""}`}
    >
      <button type="button" className={rowButtonClass} onClick={select} aria-current={active}>
        <MessageSquare />
        <span className="truncate">{item.title}</span>
        {item.unread === 1 && !active && (
          <span
            role="status"
            aria-label="新しい応答"
            className="size-[7px] shrink-0 rounded-full bg-primary"
          />
        )}
      </button>
      <button
        type="button"
        className={rowActionClass}
        aria-label={`${item.title}を削除`}
        onClick={remove}
      >
        <Trash2 />
      </button>
    </li>
  );
}

export function ChatSidebar({
  open,
  onOpenChange,
  data,
  conversationId,
  newChat,
  selectConversation,
  askDeleteConversation,
  askDeleteProject,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: Bootstrap;
  conversationId: string | null;
  newChat: (projectId?: string) => void;
  selectConversation: (item: Conversation) => void;
  askDeleteConversation: (item: Conversation) => void;
  askDeleteProject: (item: Project) => void;
}) {
  const [conversationLimit, setConversationLimit] = useState(10);
  const [projectLimits, setProjectLimits] = useState<Record<string, number>>({});
  const [openProjects, setOpenProjects] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(openProjectsKey) || "[]") as unknown;
      if (Array.isArray(saved))
        setOpenProjects(new Set(saved.filter((id): id is string => typeof id === "string")));
    } catch {
      localStorage.removeItem(openProjectsKey);
    }
  }, []);

  function setProjectOpen(id: string, projectOpen: boolean) {
    setOpenProjects((current) => {
      const next = new Set(current);
      if (projectOpen) next.add(id);
      else next.delete(id);
      localStorage.setItem(openProjectsKey, JSON.stringify([...next]));
      return next;
    });
  }

  const conversations = data.conversations.filter((item) => !item.temporary && !item.project_id);

  return (
    <NativeDialog
      open={open}
      onClose={() => onOpenChange(false)}
      label="チャット一覧"
      className="fixed inset-0 size-full"
    >
      <div
        className="size-full bg-black/20"
        onClick={(event) => event.target === event.currentTarget && onOpenChange(false)}
      >
        <aside className="flex h-full w-[min(310px,86vw)] flex-col bg-sidebar text-sidebar-foreground shadow-lg">
          <div className="h-[18px] shrink-0" />
          <nav className="min-h-0 flex-1 overflow-y-auto px-3.5" aria-label="チャット一覧">
            <ul className="flex flex-col">
              {data.projects.map((group) => {
                const projectConversations = data.conversations.filter(
                  (item) => !item.temporary && item.project_id === group.id,
                );
                const limit = projectLimits[group.id] ?? 5;
                const projectOpen = openProjects.has(group.id);
                return (
                  <li key={group.id} className="mb-[5px]">
                    <div className="flex items-center rounded-[11px] hover:bg-sidebar-accent">
                      <button
                        type="button"
                        className={`${rowButtonClass} h-[39px] px-2.5 font-semibold`}
                        aria-expanded={projectOpen}
                        onClick={() => setProjectOpen(group.id, !projectOpen)}
                      >
                        <ChevronRight
                          className={`size-[13px]! transition-transform ${projectOpen ? "rotate-90" : ""}`}
                        />
                        <ProjectIcon project={group} className="size-[22px]" />
                        <span className="min-w-0 flex-1 truncate">{group.name}</span>
                      </button>
                      <button
                        type="button"
                        className="inline-flex size-7 shrink-0 items-center justify-center rounded-[11px] text-muted-foreground [&_svg]:size-3.5"
                        aria-label={`${group.name}で新しいチャット`}
                        onClick={() => newChat(group.id)}
                      >
                        <Plus />
                      </button>
                      <button
                        type="button"
                        className="inline-flex size-7 shrink-0 items-center justify-center rounded-[11px] text-muted-foreground [&_svg]:size-3.5"
                        aria-label={`${group.name}を削除`}
                        onClick={() => askDeleteProject(group)}
                      >
                        <Trash2 />
                      </button>
                    </div>
                    {projectOpen && (
                      <ul>
                        {projectConversations.slice(0, limit).map((item) => (
                          <ConversationRow
                            key={item.id}
                            item={item}
                            active={item.id === conversationId}
                            nested
                            select={() => selectConversation(item)}
                            remove={() => askDeleteConversation(item)}
                          />
                        ))}
                        {projectConversations.length > limit && (
                          <li className="pl-5">
                            <button
                              type="button"
                              className="h-8 w-full px-[11px] text-left text-[11px] text-muted-foreground"
                              onClick={() =>
                                setProjectLimits((current) => ({
                                  ...current,
                                  [group.id]: limit + 5,
                                }))
                              }
                            >
                              もっと見る
                            </button>
                          </li>
                        )}
                      </ul>
                    )}
                  </li>
                );
              })}
              {conversations.slice(0, conversationLimit).map((item) => (
                <ConversationRow
                  key={item.id}
                  item={item}
                  active={item.id === conversationId}
                  select={() => selectConversation(item)}
                  remove={() => askDeleteConversation(item)}
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
            </ul>
          </nav>
          <footer className="px-3.5 pt-2.5 pb-3.5">
            <Link
              href="/settings/general"
              className="flex items-center gap-2.5 rounded-[15px] p-[9px] transition duration-200 hover:bg-sidebar-accent"
            >
              <span className="flex size-[34px] shrink-0 items-center justify-center overflow-hidden rounded-[11px] bg-muted font-bold">
                {data.user.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="size-full object-cover" src={data.user.avatar} alt="" />
                ) : (
                  data.user.display_name[0]
                )}
              </span>
              <strong className="min-w-0 flex-1 truncate text-xs">{data.user.display_name}</strong>
              <Settings className="size-4 text-muted-foreground" />
            </Link>
          </footer>
        </aside>
      </div>
    </NativeDialog>
  );
}
