"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type TouchEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence } from "motion/react";
import { Menu, Plus, TimerReset } from "lucide-react";
import {
  api,
  getBootstrap,
  readJson,
  socketUrl,
  type Conversation,
  type Message,
  type Project,
} from "@/lib/api";
import { useBootstrap } from "@/lib/use-bootstrap";
import { chatUrl, conversationIdFromPath, iconButtonClass } from "@/lib/ui";
import { horizontalSwipe } from "@/lib/swipe";
import { useIsMobile } from "@/hooks/use-mobile";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LoadingScreen } from "@/components/loading-screen";
import { ProjectIcon } from "@/components/project-icon";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { Composer } from "@/components/chat/composer";
import { MessageView, Thinking } from "@/components/chat/message-view";

type DeleteTarget =
  { type: "conversation"; item: Conversation } | { type: "project"; item: Project };

export function ChatShell() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const temporaryParam = searchParams.get("temporary") === "1";
  const mobile = useIsMobile();
  const [data, setData] = useBootstrap();
  const [conversationId, setConversationId] = useState<string | null>(() =>
    conversationIdFromPath(pathname),
  );
  const [projectId, setProjectId] = useState("");
  const [temporary, setTemporary] = useState(temporaryParam);
  const [messages, setMessages] = useState<Message[]>([]);
  const [visibleMessageCount, setVisibleMessageCount] = useState(50);
  const [desktopSidebar, setDesktopSidebar] = useState(true);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const openConversationRef = useRef<string | null>(conversationId);
  openConversationRef.current = conversationId;

  useEffect(() => {
    setVisibleMessageCount(50);
    if (!conversationId) {
      setMessages([]);
      return;
    }
    void api<Message[]>(`/api/conversations/${conversationId}`).then(setMessages);
  }, [conversationId]);

  useEffect(() => {
    let active = true;
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      socket = new WebSocket(socketUrl());
      socket.onmessage = ({ data: message }) => {
        const event = JSON.parse(String(message)) as
          | {
              type: "status";
              conversationId: string;
              status: Conversation["generation_status"];
            }
          | { type: "content"; conversationId: string; content: string }
          | { type: "done"; conversationId: string };
        if (event.type === "status") {
          setData((value) =>
            value
              ? {
                  ...value,
                  conversations: value.conversations.map((conversation) =>
                    conversation.id === event.conversationId
                      ? { ...conversation, generation_status: event.status }
                      : conversation,
                  ),
                }
              : value,
          );
          return;
        }
        if (event.type === "done") {
          const current =
            openConversationRef.current === event.conversationId
              ? api<Message[]>(`/api/conversations/${event.conversationId}`)
              : Promise.resolve(null);
          void Promise.all([getBootstrap(), current])
            .then(([fresh, messages]) => {
              if (!active) return;
              setData(fresh);
              if (messages && openConversationRef.current === event.conversationId)
                setMessages(messages);
            })
            .catch(() => undefined);
          return;
        }
        if (openConversationRef.current !== event.conversationId || !event.content) return;
        const streamId = `stream-${event.conversationId}`;
        setMessages((value) => {
          const streamed: Message = {
            id: streamId,
            role: "assistant",
            content: event.content,
            files: [],
            created_at: new Date().toISOString(),
          };
          return value.some((item) => item.id === streamId)
            ? value.map((item) => (item.id === streamId ? streamed : item))
            : [...value, streamed];
        });
      };
      socket.onclose = () => {
        if (active) retry = setTimeout(connect, 1_000);
      };
    };
    connect();
    return () => {
      active = false;
      clearTimeout(retry);
      socket?.close();
    };
  }, [setData]);

  const conversations = data?.conversations;
  useEffect(() => {
    if (!conversations) return;
    const id = conversationIdFromPath(pathname);
    const conversation = conversations.find((item) => item.id === id);
    if (id && !conversation) {
      router.replace(chatUrl("/", temporaryParam));
      return;
    }
    setConversationId(conversation?.id || null);
    setProjectId(conversation?.project_id || "");
    setTemporary(temporaryParam);
  }, [conversations, pathname, temporaryParam, router]);

  const lastMessage = messages.at(-1);
  const visibleMessages = messages.slice(-visibleMessageCount);
  useEffect(() => {
    if (!autoScrollRef.current) return;
    requestAnimationFrame(() =>
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }),
    );
  }, [lastMessage?.content, lastMessage?.id, sending]);

  const refreshChat = useCallback(
    async (id: string) => {
      const [fresh, current] = await Promise.all([
        getBootstrap(),
        api<Message[]>(`/api/conversations/${id}`),
      ]);
      setData(fresh);
      setMessages(current);
    },
    [setData],
  );

  if (!data) return <LoadingScreen />;

  const project = data.projects.find((item) => item.id === projectId);
  const activeConversation = data.conversations.find((item) => item.id === conversationId);
  const generating = sending || activeConversation?.generation_status === "running";
  const editing = editingMessageId !== null;

  function selectConversation(item: Conversation) {
    const isTemporary = item.temporary === 1;
    autoScrollRef.current = true;
    setEditingMessageId(null);
    setPrompt("");
    setConversationId(item.id);
    setProjectId(item.project_id || "");
    setTemporary(isTemporary);
    router.push(chatUrl(`/chat/${item.id}`, isTemporary));
    setMobileSidebar(false);
  }
  function newChat(targetProjectId = "", isTemporary = temporary) {
    autoScrollRef.current = true;
    setEditingMessageId(null);
    setPrompt("");
    setConversationId(null);
    setProjectId(targetProjectId);
    setMessages([]);
    router.push(chatUrl("/", isTemporary));
    setMobileSidebar(false);
  }
  function toggleTemporary() {
    const next = !temporary;
    setTemporary(next);
    newChat("", next);
  }
  async function removeConversation(item: Conversation) {
    await api(`/api/conversations/${item.id}`, { method: "DELETE" });
    setData((value) =>
      value
        ? {
            ...value,
            conversations: value.conversations.filter(
              (conversation) => conversation.id !== item.id,
            ),
          }
        : value,
    );
    if (conversationIdFromPath(pathname) === item.id) newChat();
  }
  async function removeProject(item: Project) {
    await api(`/api/projects/${item.id}`, { method: "DELETE" });
    setData((value) =>
      value
        ? {
            ...value,
            projects: value.projects.filter((project) => project.id !== item.id),
            conversations: value.conversations.filter(
              (conversation) => conversation.project_id !== item.id,
            ),
          }
        : value,
    );
    if (projectId === item.id) newChat();
  }
  function appendError(prefix: string, error: unknown) {
    setMessages((value) => [
      ...value,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `${prefix}: ${error instanceof Error ? error.message : String(error)}`,
        files: [],
        created_at: new Date().toISOString(),
      },
    ]);
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if ((!prompt.trim() && !files.length) || generating) return;
    autoScrollRef.current = true;
    setSending(true);
    let currentId = conversationId;
    try {
      if (!currentId) {
        const created = await api<Conversation>("/api/conversations", {
          method: "POST",
          body: JSON.stringify({ projectId, temporary }),
        });
        currentId = created.id;
        setConversationId(created.id);
        setData((value) =>
          value ? { ...value, conversations: [created, ...value.conversations] } : value,
        );
        window.history.replaceState(null, "", chatUrl(`/chat/${created.id}`, temporary));
      }
      const text = prompt.trim();
      if (editingMessageId) {
        await api(`/api/conversations/${currentId}/regenerate`, {
          method: "POST",
          body: JSON.stringify({ messageId: editingMessageId, content: text }),
        });
        setEditingMessageId(null);
        setPrompt("");
        await refreshChat(currentId);
        return;
      }
      const optimistic: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        files: files.map((file) => ({
          id: "",
          name: file.name,
          mime: file.type,
          size: file.size,
          source: "upload",
          created_at: new Date().toISOString(),
          preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
        })),
        created_at: new Date().toISOString(),
      };
      setMessages((value) => [...value, optimistic]);
      setPrompt("");
      setFiles([]);
      const form = new FormData();
      form.set("conversationId", currentId);
      form.set("content", text);
      files.forEach((file) => form.append("files", file));
      const response = await fetch("/api/chat", { method: "POST", body: form });
      const body = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      await refreshChat(currentId);
    } catch (error) {
      appendError("エラー", error);
    } finally {
      setSending(false);
    }
  }
  async function stop() {
    if (!conversationId) return;
    try {
      await api(`/api/conversations/${conversationId}/stop`, { method: "POST" });
      setSending(false);
      await refreshChat(conversationId);
    } catch (error) {
      appendError("停止エラー", error);
    }
  }
  async function regenerate(messageId: string) {
    if (!conversationId) return;
    setEditingMessageId(null);
    setPrompt("");
    setSending(true);
    setMessages((value) => {
      const index = value.findIndex((message) => message.id === messageId);
      return index < 0 ? value : value.slice(0, index + 1);
    });
    try {
      await api(`/api/conversations/${conversationId}/regenerate`, {
        method: "POST",
        body: JSON.stringify({ messageId }),
      });
      await refreshChat(conversationId);
    } catch (error) {
      appendError("再生成エラー", error);
    } finally {
      setSending(false);
    }
  }

  function startSidebarSwipe(event: TouchEvent) {
    swipeStartRef.current = null;
    if (!mobile || event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (!mobileSidebar && touch.clientX > 32) return;
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  }
  function endSidebarSwipe(event: TouchEvent) {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    const direction = horizontalSwipe(start, { x: touch.clientX, y: touch.clientY });
    if (direction > 0 && !mobileSidebar) setMobileSidebar(true);
    if (direction < 0 && mobileSidebar) setMobileSidebar(false);
  }

  return (
    <SidebarProvider
      className="h-dvh min-h-0 overflow-hidden overscroll-none"
      open={desktopSidebar}
      onOpenChange={setDesktopSidebar}
      openMobile={mobileSidebar}
      onOpenMobileChange={setMobileSidebar}
      onTouchStart={startSidebarSwipe}
      onTouchEnd={endSidebarSwipe}
      onTouchCancel={() => (swipeStartRef.current = null)}
    >
      <ChatSidebar
        data={data}
        conversationId={conversationId}
        newChat={newChat}
        selectConversation={selectConversation}
        askDeleteConversation={(item) => {
          setDeleteTarget({ type: "conversation", item });
          setDeleteOpen(true);
        }}
        askDeleteProject={(item) => {
          setDeleteTarget({ type: "project", item });
          setDeleteOpen(true);
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={deleteTarget?.type === "project" ? "プロジェクトを削除" : "チャットを削除"}
        text={
          deleteTarget?.type === "project"
            ? `「${deleteTarget.item.name}」と中のチャット・ファイルを削除します。`
            : `「${deleteTarget?.item.title ?? ""}」と添付ファイルを削除します。`
        }
        onConfirm={async () => {
          if (!deleteTarget) return;
          if (deleteTarget.type === "project") await removeProject(deleteTarget.item);
          else await removeConversation(deleteTarget.item);
        }}
      />

      <SidebarInset className="relative min-h-0 min-w-0 overflow-hidden bg-[radial-gradient(circle_at_50%_0,#c15f3c08,transparent_34%)]">
        <header className="z-10 flex h-16 shrink-0 items-center gap-2 border-b border-[color-mix(in_srgb,var(--border)_62%,transparent)] bg-[color-mix(in_srgb,var(--background)_80%,transparent)] px-[22px] backdrop-blur-[18px] max-md:h-[58px] max-md:px-2.5">
          <SidebarTrigger className={iconButtonClass} aria-label="サイドバーを開閉">
            <Menu />
          </SidebarTrigger>
          <Button
            variant="ghost"
            size="icon-lg"
            className={`${iconButtonClass} hidden max-md:inline-flex`}
            onClick={() => newChat()}
            aria-label="新しいチャット"
          >
            <Plus />
          </Button>
          {project && (
            <div className="flex h-10 min-w-0 max-w-[280px] items-center gap-2 px-2 text-[13px] font-semibold">
              <ProjectIcon project={project} className="size-[26px]" />
              <span className="truncate">{project.name}</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon-lg"
            className={`${iconButtonClass} ml-auto ${temporary ? "bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-primary" : ""}`}
            onClick={toggleTemporary}
            aria-label={temporary ? "一時チャットを終了" : "一時チャットを開始"}
          >
            <TimerReset />
          </Button>
        </header>
        <ScrollArea
          className="min-h-0 flex-1"
          viewportRef={scrollRef}
          viewportProps={{
            className: "overscroll-none scroll-smooth",
            onScroll: (event) => {
              const element = event.currentTarget;
              autoScrollRef.current =
                element.scrollHeight - element.scrollTop - element.clientHeight < 120;
            },
          }}
        >
          {messages.length > 0 && (
            <div className="mx-auto w-[min(820px,calc(100%-32px))] pt-11 pb-10 max-md:pt-[27px]">
              {visibleMessages.length < messages.length && (
                <Button
                  variant="outline"
                  className="mx-auto mb-8 flex h-auto rounded-[10px] bg-card px-3.5 py-2 text-[11px] font-normal text-muted-foreground"
                  onClick={() => setVisibleMessageCount((count) => count + 50)}
                >
                  以前のメッセージを表示
                </Button>
              )}
              <AnimatePresence initial={false}>
                {visibleMessages.map((message) => (
                  <MessageView
                    key={message.id}
                    message={message}
                    disabled={generating}
                    regenerate={() => void regenerate(message.id)}
                    edit={() => {
                      setEditingMessageId(message.id);
                      setPrompt(message.content);
                      setFiles([]);
                    }}
                  />
                ))}
              </AnimatePresence>
              {generating && <Thinking />}
            </div>
          )}
        </ScrollArea>
        <Composer
          prompt={prompt}
          setPrompt={setPrompt}
          files={files}
          setFiles={setFiles}
          temporary={temporary}
          mobile={mobile}
          ctrlEnterSend={data.user.ctrl_enter_send === 1}
          generating={generating}
          editing={editing}
          cancelEditing={() => {
            setEditingMessageId(null);
            setPrompt("");
          }}
          stop={stop}
          send={send}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
