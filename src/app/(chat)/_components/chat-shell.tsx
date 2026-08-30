"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from "motion/react";
import { Menu, MessageCircleDashed, SquarePen } from "lucide-react";
import {
  api,
  getBootstrap,
  readJson,
  socketUrl,
  type Conversation,
  type Message,
  type MessagePage,
} from "@/lib/api";
import { useBootstrap } from "@/hooks/use-bootstrap";
import { iconButtonClass } from "@/lib/ui";
import { canStartSwipe, shouldCompleteSwipe } from "@/lib/swipe";
import { chatUrl, conversationIdFromPath } from "@/app/(chat)/_libs/chat";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LoadingScreen } from "@/components/loading-screen";
import { ProjectIcon } from "@/components/project-icon";
import { ChatSidebar } from "@/app/(chat)/_components/chat-sidebar";
import { Composer } from "@/app/(chat)/_components/composer";
import { MessageView, Thinking } from "@/app/(chat)/_components/message-view";
import { SettingsShell } from "@/app/settings/_components/settings-shell";

export function ChatShell() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const temporaryParam = searchParams.get("temporary") === "1";
  const [data, setData] = useBootstrap();
  const [conversationId, setConversationId] = useState<string | null>(() =>
    conversationIdFromPath(pathname),
  );
  const [projectId, setProjectId] = useState("");
  const [temporary, setTemporary] = useState(temporaryParam);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [sidebarDragging, setSidebarDragging] = useState(false);
  const sidebarX = useMotionValue(0);
  const sidebarRadius = useTransform(sidebarX, [0, 30], [0, 30]);
  const sidebarGestureStart = useRef(0);
  const sidebarSwipeActive = useRef(false);
  const reduceMotion = useReducedMotion();
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openConversationRef = useRef<string | null>(conversationId);
  openConversationRef.current = conversationId;

  useEffect(() => {
    if (sidebarDragging) return;
    const animation = animate(sidebarX, mobileSidebar ? window.innerWidth * 0.86 : 0, {
      duration: reduceMotion ? 0 : 0.38,
      ease: [0.32, 0.72, 0, 1],
    });
    return () => animation.stop();
  }, [mobileSidebar, reduceMotion, sidebarDragging, sidebarX]);

  useEffect(() => {
    setMessages([]);
    setHasOlderMessages(false);
    if (!conversationId) return;
    let active = true;
    void api<MessagePage>(`/api/conversations/${conversationId}`).then((page) => {
      if (!active) return;
      setMessages(page.messages);
      setHasOlderMessages(page.hasMore);
    });
    return () => {
      active = false;
    };
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
              ? api<MessagePage>(`/api/conversations/${event.conversationId}`)
              : Promise.resolve(null);
          void Promise.all([getBootstrap(), current])
            .then(([fresh, page]) => {
              if (!active) return;
              setData(fresh);
              if (page && openConversationRef.current === event.conversationId) {
                setMessages(page.messages);
                setHasOlderMessages(page.hasMore);
              }
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
      const closingSocket = socket;
      if (closingSocket?.readyState === WebSocket.CONNECTING) {
        closingSocket.onopen = () => closingSocket.close();
      } else {
        closingSocket?.close();
      }
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

  const refreshChat = useCallback(
    async (id: string) => {
      const [fresh, page] = await Promise.all([
        getBootstrap(),
        api<MessagePage>(`/api/conversations/${id}`),
      ]);
      setData(fresh);
      setMessages(page.messages);
      setHasOlderMessages(page.hasMore);
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
    setEditingMessageId(null);
    setPrompt("");
    setConversationId(item.id);
    setProjectId(item.project_id || "");
    setTemporary(isTemporary);
    router.push(chatUrl(`/chat/${item.id}`, isTemporary));
    setMobileSidebar(false);
  }
  function newChat(targetProjectId = "", isTemporary = temporary) {
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
  async function loadOlderMessages() {
    const oldest = messages[0];
    const currentConversationId = conversationId;
    if (!oldest || !currentConversationId || loadingOlderMessages) return;
    setLoadingOlderMessages(true);
    try {
      const page = await api<MessagePage>(
        `/api/conversations/${currentConversationId}?before=${encodeURIComponent(oldest.id)}`,
      );
      if (openConversationRef.current !== currentConversationId) return;
      setMessages((value) => [...page.messages, ...value]);
      setHasOlderMessages(page.hasMore);
    } finally {
      setLoadingOlderMessages(false);
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
  function startSidebarSwipe(info: PanInfo) {
    sidebarSwipeActive.current = canStartSwipe(mobileSidebar, info.point.x, window.innerWidth);
    if (!sidebarSwipeActive.current) return;
    sidebarGestureStart.current = sidebarX.get();
    setSidebarDragging(true);
  }
  function moveSidebarSwipe(info: PanInfo) {
    if (!sidebarSwipeActive.current) return;
    const width = window.innerWidth * 0.86;
    sidebarX.set(Math.max(0, Math.min(width, sidebarGestureStart.current + info.offset.x)));
  }
  function endSidebarSwipe(info: PanInfo) {
    if (!sidebarSwipeActive.current) return;
    sidebarSwipeActive.current = false;
    const width = window.innerWidth * 0.86;
    setMobileSidebar(shouldCompleteSwipe(sidebarX.get(), width / 2, info.velocity.x));
    setSidebarDragging(false);
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

  return (
    <div className="relative flex h-dvh min-h-0 overflow-hidden overscroll-none bg-sidebar">
      <ChatSidebar
        open={mobileSidebar || sidebarDragging}
        onOpenChange={setMobileSidebar}
        data={data}
        conversationId={conversationId}
        newChat={newChat}
        selectConversation={selectConversation}
        askDeleteConversation={(item) => {
          setDeleteTarget(item);
          setDeleteOpen(true);
        }}
        openSettings={() => setSettingsOpen(true)}
      />

      {!mobileSidebar && (
        <motion.div
          className="absolute inset-y-0 left-0 z-20 w-5 touch-none"
          aria-hidden="true"
          onPanStart={(_, info: PanInfo) => startSidebarSwipe(info)}
          onPan={(_, info: PanInfo) => moveSidebarSwipe(info)}
          onPanEnd={(_, info: PanInfo) => endSidebarSwipe(info)}
        />
      )}

      <SettingsShell
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        data={data}
        setData={setData}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="チャットを削除"
        text={`「${deleteTarget?.title ?? ""}」と添付ファイルを削除します。`}
        onConfirm={async () => {
          if (deleteTarget) await removeConversation(deleteTarget);
        }}
      />

      <motion.main
        style={{ x: sidebarX, borderBottomLeftRadius: sidebarRadius }}
        onPanStart={(_, info: PanInfo) => startSidebarSwipe(info)}
        onPan={(_, info: PanInfo) => moveSidebarSwipe(info)}
        onPanEnd={(_, info: PanInfo) => endSidebarSwipe(info)}
        className="relative z-10 flex min-h-0 w-full shrink-0 touch-pan-y flex-col overflow-hidden bg-background"
      >
        {(mobileSidebar || sidebarDragging) && (
          <button
            type="button"
            className="absolute inset-0 z-20"
            aria-label="サイドバーを閉じる"
            onClick={() => setMobileSidebar(false)}
          />
        )}
        <header className="absolute inset-x-0 top-0 z-10 flex h-[72px] items-start gap-2 px-[18px] pt-2.5">
          <button
            type="button"
            className={`${iconButtonClass} inline-flex items-center justify-center`}
            aria-label="サイドバーを開閉"
            onClick={() => setMobileSidebar(true)}
          >
            <Menu />
          </button>
          {project && (
            <div className="flex h-10 min-w-0 max-w-[280px] items-center gap-2 px-2 text-[13px] font-semibold">
              <ProjectIcon project={project} className="size-[26px]" />
              <span className="truncate">{project.name}</span>
            </div>
          )}
          {conversationId ? (
            <button
              type="button"
              className={`${iconButtonClass} ml-auto inline-flex items-center justify-center`}
              onClick={() => newChat()}
              aria-label="新しいチャット"
            >
              <SquarePen />
            </button>
          ) : (
            <button
              type="button"
              className={`${iconButtonClass} ml-auto inline-flex items-center justify-center ${temporary ? "bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-primary" : ""}`}
              onClick={toggleTemporary}
              aria-label={temporary ? "一時チャットを終了" : "一時チャットを開始"}
            >
              <MessageCircleDashed />
            </button>
          )}
        </header>
        <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto overscroll-none">
          {messages.length > 0 && (
            <div className="mx-auto w-[calc(100%-32px)] shrink-0 pt-[86px] pb-[96px]">
              {hasOlderMessages && (
                <button
                  type="button"
                  className="mx-auto mb-8 flex h-auto rounded-[10px] border border-border bg-card px-3.5 py-2 text-[11px] text-muted-foreground disabled:opacity-50"
                  disabled={loadingOlderMessages}
                  onClick={() => void loadOlderMessages()}
                >
                  {loadingOlderMessages ? "読み込み中" : "以前のメッセージを表示"}
                </button>
              )}
              <AnimatePresence initial={false}>
                {messages.map((message) => (
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
        </div>
        <Composer
          prompt={prompt}
          setPrompt={setPrompt}
          files={files}
          setFiles={setFiles}
          temporary={temporary}
          generating={generating}
          editing={editing}
          cancelEditing={() => {
            setEditingMessageId(null);
            setPrompt("");
          }}
          stop={stop}
          send={send}
        />
      </motion.main>
    </div>
  );
}
