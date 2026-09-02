"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from "motion/react";
import { ArrowDown, Menu, MessageCircleDashed, SquarePen } from "lucide-react";
import {
  api,
  getBootstrap,
  readJson,
  socketUrl,
  type ChatEventEnvelope,
  type Conversation,
  type Message,
  type MessagePage,
} from "@/lib/api";
import { useBootstrap } from "@/hooks/use-bootstrap";
import { iconButtonClass } from "@/lib/ui";
import { canStartSwipe, shouldCompleteSwipe } from "@/lib/swipe";
import {
  chatUrl,
  conversationIdFromPath,
  isChatEventEnvelope,
  isFarFromChatBottom,
  isNearChatBottom,
  reduceChatStreams,
  streamMessage,
} from "@/app/(chat)/_libs/chat";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LoadingScreen } from "@/components/loading-screen";
import { LoadingWave } from "@/components/loading-wave";
import { ChatSidebar } from "@/app/(chat)/_components/chat-sidebar";
import { Composer } from "@/app/(chat)/_components/composer";
import { MessageView, Thinking } from "@/app/(chat)/_components/message-view";
import { SettingsShell } from "@/app/settings/_components/settings-shell";

export function ChatShell() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const temporaryParam = searchParams.get("temporary") === "1";
  const projectParam = searchParams.get("project") || "";
  const [data, setData] = useBootstrap();
  const shellReady = data !== null;
  const [conversationId, setConversationId] = useState<string | null>(() =>
    conversationIdFromPath(pathname),
  );
  const [projectId, setProjectId] = useState(projectParam);
  const [temporary, setTemporary] = useState(temporaryParam);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streams, dispatchStream] = useReducer(reduceChatStreams, {});
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
  const [socketConnected, setSocketConnected] = useState(false);
  const [readyConversationId, setReadyConversationId] = useState<string | null>(null);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openConversationRef = useRef<string | null>(conversationId);
  const shellRef = useRef<HTMLDivElement>(null);
  const messageViewportRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const olderMessagesSentinelRef = useRef<HTMLDivElement>(null);
  const loadingOlderMessagesRef = useRef(false);
  const prependScrollRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const followLatestRef = useRef(true);
  openConversationRef.current = conversationId;

  useEffect(() => {
    const shell = shellRef.current;
    const viewport = window.visualViewport;
    if (!shell || !viewport) return;

    let keyboardOpen = false;
    let frame = 0;
    let historyAnimation: Animation | undefined;
    const isEditable = (element: Element | null) =>
      (element instanceof HTMLTextAreaElement && !element.readOnly) ||
      (element instanceof HTMLInputElement &&
        !element.readOnly &&
        !["button", "checkbox", "file", "hidden", "radio", "range", "reset", "submit"].includes(
          element.type,
        )) ||
      (element instanceof HTMLElement && element.isContentEditable);
    const reset = () => {
      keyboardOpen = false;
      shell.style.removeProperty("height");
      shell.style.removeProperty("--composer-bottom-padding");
    };
    const update = () => {
      if (viewport.scale !== 1) {
        reset();
        return;
      }
      const messageList = messageListRef.current;
      const previousTop = messageList?.getBoundingClientRect().top;
      historyAnimation?.cancel();

      const focused = isEditable(document.activeElement);
      const reduced = viewport.height < document.documentElement.clientHeight - 1;
      keyboardOpen = reduced && (focused || keyboardOpen);
      if (!focused && !keyboardOpen) reset();
      else {
        shell.style.height = `${viewport.height}px`;
        if (keyboardOpen) shell.style.setProperty("--composer-bottom-padding", "15px");
        else shell.style.removeProperty("--composer-bottom-padding");
      }

      if (reduceMotion || !messageList || previousTop === undefined) return;
      const distance = previousTop - messageList.getBoundingClientRect().top;
      if (Math.abs(distance) < 1) return;
      historyAnimation = messageList.animate(
        [{ transform: `translateY(${distance}px)` }, { transform: "translateY(0)" }],
        { duration: 260, easing: "cubic-bezier(0.32, 0.72, 0, 1)" },
      );
    };
    const updateAfterFocus = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };

    update();
    viewport.addEventListener("resize", update);
    document.addEventListener("focusin", updateAfterFocus);
    document.addEventListener("focusout", updateAfterFocus);
    return () => {
      cancelAnimationFrame(frame);
      historyAnimation?.cancel();
      viewport.removeEventListener("resize", update);
      document.removeEventListener("focusin", updateAfterFocus);
      document.removeEventListener("focusout", updateAfterFocus);
      reset();
    };
  }, [reduceMotion, shellReady]);

  const messageListReady =
    messages.length > 0 || Boolean(conversationId && streams[conversationId]);
  useLayoutEffect(() => {
    const viewport = messageViewportRef.current;
    const list = messageListRef.current;
    if (!viewport || !list) return;
    followLatestRef.current = true;
    setShowScrollToLatest(false);
    viewport.scrollTop = viewport.scrollHeight;
    const trackPosition = () => {
      followLatestRef.current = isNearChatBottom(
        viewport.scrollHeight,
        viewport.clientHeight,
        viewport.scrollTop,
      );
      setShowScrollToLatest(
        isFarFromChatBottom(viewport.scrollHeight, viewport.clientHeight, viewport.scrollTop),
      );
    };
    const observer = new ResizeObserver(() => {
      if (followLatestRef.current) viewport.scrollTop = viewport.scrollHeight;
      trackPosition();
    });
    observer.observe(list);
    viewport.addEventListener("scroll", trackPosition, { passive: true });
    return () => {
      observer.disconnect();
      viewport.removeEventListener("scroll", trackPosition);
    };
  }, [conversationId, messageListReady]);

  useLayoutEffect(() => {
    const pending = prependScrollRef.current;
    const viewport = messageViewportRef.current;
    if (!pending || !viewport) return;
    viewport.scrollTop = pending.scrollTop + viewport.scrollHeight - pending.scrollHeight;
    prependScrollRef.current = null;
  }, [messages]);

  useEffect(() => {
    if (!conversationId || !messageListReady || readyConversationId === conversationId) return;
    const list = messageListRef.current;
    if (!list) return;
    let active = true;
    let frame = 0;
    void Promise.all(
      [...list.querySelectorAll<HTMLImageElement>("img[data-image-preview]")].map(waitForImage),
    ).then(() => {
      if (!active) return;
      frame = requestAnimationFrame(() => {
        const viewport = messageViewportRef.current;
        if (viewport) {
          followLatestRef.current = true;
          viewport.scrollTop = viewport.scrollHeight;
          setShowScrollToLatest(false);
        }
        setReadyConversationId(conversationId);
      });
    });
    return () => {
      active = false;
      cancelAnimationFrame(frame);
    };
  }, [conversationId, messageListReady, readyConversationId]);

  const loadOlderMessages = useCallback(async () => {
    const oldest = messages[0];
    const currentConversationId = conversationId;
    if (!oldest || !currentConversationId || loadingOlderMessagesRef.current) return;
    loadingOlderMessagesRef.current = true;
    setLoadingOlderMessages(true);
    try {
      const page = await api<MessagePage>(
        `/api/conversations/${currentConversationId}?before=${encodeURIComponent(oldest.id)}`,
      );
      await preloadMessagePreviews(page.messages);
      if (openConversationRef.current !== currentConversationId) return;
      const viewport = messageViewportRef.current;
      if (viewport)
        prependScrollRef.current = {
          scrollHeight: viewport.scrollHeight,
          scrollTop: viewport.scrollTop,
        };
      setMessages((value) => [...page.messages, ...value]);
      setHasOlderMessages(page.hasMore);
    } finally {
      loadingOlderMessagesRef.current = false;
      setLoadingOlderMessages(false);
    }
  }, [conversationId, messages]);

  useEffect(() => {
    const root = messageViewportRef.current;
    const sentinel = olderMessagesSentinelRef.current;
    if (
      !root ||
      !sentinel ||
      !hasOlderMessages ||
      loadingOlderMessages ||
      readyConversationId !== conversationId
    )
      return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void loadOlderMessages();
      },
      { root, rootMargin: "320px 0px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    conversationId,
    hasOlderMessages,
    loadOlderMessages,
    loadingOlderMessages,
    readyConversationId,
  ]);

  useEffect(() => {
    if (sidebarDragging) return;
    const animation = animate(sidebarX, mobileSidebar ? window.innerWidth * 0.86 : 0, {
      duration: reduceMotion ? 0 : 0.38,
      ease: [0.32, 0.72, 0, 1],
    });
    return () => animation.stop();
  }, [mobileSidebar, reduceMotion, sidebarDragging, sidebarX]);

  useEffect(() => {
    let active = true;
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let connected = false;
    const sync = async (targetConversationId?: string) => {
      const fresh = await getBootstrap();
      if (!active) return;
      setData(fresh);
      const openId = openConversationRef.current;
      if (
        !openId ||
        (targetConversationId && targetConversationId !== openId) ||
        !fresh.conversations.some((conversation) => conversation.id === openId)
      )
        return;
      const page = await api<MessagePage>(`/api/conversations/${openId}`);
      if (!active || openConversationRef.current !== openId) return;
      setMessages(page.messages);
      setHasOlderMessages(page.hasMore);
      setData((value) => clearUnread(value, openId));
    };
    const finishRun = (event: ChatEventEnvelope) => {
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
            setData((value) => clearUnread(value, event.conversationId));
          }
          dispatchStream({ type: "clear", conversationId: event.conversationId });
        })
        .catch(() => undefined);
    };
    const connect = () => {
      socket = new WebSocket(socketUrl());
      socket.onopen = () => {
        setSocketConnected(true);
        const reconnecting = connected;
        connected = true;
        attempts = 0;
        if (reconnecting) void sync().catch(() => undefined);
      };
      socket.onmessage = ({ data: message }) => {
        let event: unknown;
        try {
          event = JSON.parse(String(message));
        } catch {
          return;
        }
        if (
          typeof event === "object" &&
          event !== null &&
          "type" in event &&
          event.type === "sync"
        ) {
          const conversationId =
            "conversationId" in event && typeof event.conversationId === "string"
              ? event.conversationId
              : undefined;
          void sync(conversationId).catch(() => undefined);
          return;
        }
        if (!isChatEventEnvelope(event)) return;
        dispatchStream({ type: "event", envelope: event });
        if (event.event.type === "run.status") {
          const status = event.event.status;
          setData((value) =>
            value
              ? {
                  ...value,
                  conversations: value.conversations.map((conversation) =>
                    conversation.id === event.conversationId
                      ? {
                          ...conversation,
                          generation_status:
                            status === "running" || status === "stopped" ? status : "idle",
                          activeRunId:
                            status === "queued" || status === "running" ? event.runId : null,
                        }
                      : conversation,
                  ),
                }
              : value,
          );
        } else if (event.event.type === "run.done") finishRun(event);
      };
      socket.onerror = () => {
        setSocketConnected(false);
        socket?.close();
      };
      socket.onclose = () => {
        if (!active) return;
        setSocketConnected(false);
        const delay = Math.min(10_000, 500 * 2 ** attempts++);
        retry = setTimeout(connect, delay);
      };
    };
    connect();
    return () => {
      active = false;
      clearTimeout(retry);
      const closingSocket = socket;
      if (closingSocket?.readyState === WebSocket.CONNECTING)
        closingSocket.onopen = () => closingSocket.close();
      else closingSocket?.close();
    };
  }, [setData]);

  const conversations = data?.conversations;
  const requestedConversationId = conversationIdFromPath(pathname);
  const requestedConversation = conversations?.find((item) => item.id === requestedConversationId);
  const resolvedConversationId = requestedConversation?.id || null;
  const requestedProjectId = requestedConversation?.project_id || "";
  const conversationsLoaded = conversations !== undefined;
  useEffect(() => {
    if (!conversationsLoaded) return;
    if (requestedConversationId && !resolvedConversationId) {
      router.replace(chatUrl("/", temporaryParam, projectParam));
      return;
    }
    if (!resolvedConversationId) {
      setReadyConversationId(null);
      setConversationId(null);
      setProjectId(projectParam);
      setMessages([]);
      setHasOlderMessages(false);
      setTemporary(temporaryParam);
      return;
    }
    let active = true;
    void api<MessagePage>(`/api/conversations/${resolvedConversationId}`).then((page) => {
      if (!active) return;
      setMessages(page.messages);
      setHasOlderMessages(page.hasMore);
      setData((value) => clearUnread(value, resolvedConversationId));
      setConversationId(resolvedConversationId);
      setProjectId(requestedProjectId);
      setTemporary(temporaryParam);
    });
    return () => {
      active = false;
    };
  }, [
    conversationsLoaded,
    requestedConversationId,
    requestedProjectId,
    resolvedConversationId,
    temporaryParam,
    projectParam,
    router,
    setData,
  ]);

  const refreshChat = useCallback(
    async (id: string) => {
      const [fresh, page] = await Promise.all([
        getBootstrap(),
        api<MessagePage>(`/api/conversations/${id}`),
      ]);
      setData(clearUnread(fresh, id));
      setMessages(page.messages);
      setHasOlderMessages(page.hasMore);
    },
    [setData],
  );

  if (!data) return <LoadingScreen />;

  const project = data.projects.find((item) => item.id === projectId);
  const activeConversation = data.conversations.find((item) => item.id === conversationId);
  const activeStream = conversationId ? streams[conversationId] : undefined;
  const streamedMessage = activeStream ? streamMessage(activeStream) : undefined;
  const displayedMessages = streamedMessage
    ? [...messages.filter((message) => message.runId !== streamedMessage.runId), streamedMessage]
    : messages;
  const generating =
    sending ||
    activeConversation?.generation_status === "running" ||
    activeStream?.status === "queued" ||
    activeStream?.status === "running";
  const editing = editingMessageId !== null;
  const waitingForResponse = !streamedMessage?.content && !streamedMessage?.activities?.length;
  const newestImageMessageId = displayedMessages.reduceRight<string | undefined>(
    (id, message) =>
      id ?? (message.files.some((file) => file.mime.startsWith("image/")) ? message.id : undefined),
    undefined,
  );

  function selectConversation(item: Conversation) {
    setReadyConversationId(null);
    setEditingMessageId(null);
    setPrompt("");
    router.replace(chatUrl(`/chat/${item.id}`, item.temporary === 1));
    setMobileSidebar(false);
  }
  function newChat(targetProjectId = "", isTemporary = temporary) {
    setReadyConversationId(null);
    setEditingMessageId(null);
    setPrompt("");
    setConversationId(null);
    setProjectId(targetProjectId);
    setMessages([]);
    router.replace(chatUrl("/", isTemporary, targetProjectId));
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
    followLatestRef.current = true;
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
        author: {
          id: data!.user.id,
          username: data!.user.username,
          display_name: data!.user.display_name,
          avatar: data!.user.avatar,
        },
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
    followLatestRef.current = true;
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
    <div
      ref={shellRef}
      className="relative flex h-dvh min-h-0 overflow-hidden overscroll-none bg-sidebar"
    >
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
          onTouchStart={(event) => event.preventDefault()}
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
          {!socketConnected && (
            <div
              className="pointer-events-none absolute top-[52px] left-1/2 -translate-x-1/2 rounded-full bg-muted px-2.5 py-1 text-[10px] text-muted-foreground"
              role="status"
            >
              再接続中
            </div>
          )}
          {project && (
            <div className="absolute left-1/2 flex h-10 min-w-0 max-w-[calc(100%-132px)] -translate-x-1/2 items-center px-2 text-[13px] font-semibold">
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
        <div
          ref={messageViewportRef}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-auto"
        >
          {!conversationId && (
            <Image
              src="/favicon.svg?v=3"
              width={96}
              height={96}
              alt=""
              className="pointer-events-none m-auto size-24 [-webkit-touch-callout:none] [-webkit-user-drag:none]"
              loading="eager"
              draggable={false}
              unoptimized
            />
          )}
          {displayedMessages.length > 0 && (
            <div
              ref={messageListRef}
              className={`mx-auto flex min-h-full w-[calc(100%-32px)] shrink-0 flex-col pt-[86px] pb-[96px] ${readyConversationId === conversationId ? "" : "pointer-events-none"}`}
              aria-live="polite"
              aria-busy={generating}
              aria-hidden={readyConversationId === conversationId ? undefined : true}
            >
              <motion.div
                key={conversationId}
                className="mt-auto"
                initial={false}
                animate={{ opacity: readyConversationId === conversationId ? 1 : 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.2 }}
              >
                {hasOlderMessages && (
                  <div
                    ref={olderMessagesSentinelRef}
                    className="mb-4 flex h-8 items-center justify-center"
                    role="status"
                  >
                    {loadingOlderMessages ? (
                      <LoadingWave className="text-sm text-muted-foreground" label="読み込み中" />
                    ) : null}
                  </div>
                )}
                {displayedMessages.map((message) => (
                  <MessageView
                    key={message.id}
                    message={message}
                    disabled={generating}
                    shared={Boolean(project?.shared)}
                    draft={editingMessageId === message.id ? prompt : undefined}
                    regenerate={() => void regenerate(message.id)}
                    edit={() => {
                      setEditingMessageId(message.id);
                      setPrompt(message.content);
                      setFiles([]);
                    }}
                    prioritizeImages={message.id === newestImageMessageId}
                  />
                ))}
                {generating && waitingForResponse && <Thinking />}
              </motion.div>
            </div>
          )}
        </div>
        {showScrollToLatest && (
          <button
            type="button"
            className="liquid-glass liquid-glass-control absolute bottom-24 left-1/2 z-10 inline-flex size-10 -translate-x-1/2 items-center justify-center rounded-full text-muted-foreground [&_svg]:size-4"
            aria-label="最新のメッセージへ移動"
            onClick={() => {
              const viewport = messageViewportRef.current;
              if (!viewport) return;
              followLatestRef.current = true;
              viewport.scrollTop = viewport.scrollHeight;
              setShowScrollToLatest(false);
            }}
          >
            <ArrowDown />
          </button>
        )}
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

function preloadMessagePreviews(messages: readonly Message[]): Promise<void[]> {
  return Promise.all(
    messages.flatMap((message) =>
      message.files
        .filter((file) => file.mime.startsWith("image/") && file.id && !file.preview)
        .map((file) => {
          const image = new window.Image();
          image.src = `/files/${file.id}?preview`;
          return waitForImage(image);
        }),
    ),
  );
}

function waitForImage(image: HTMLImageElement): Promise<void> {
  if (image.complete) return Promise.resolve();
  return new Promise((resolve) => {
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener("error", () => resolve(), { once: true });
  });
}

function clearUnread<T extends { conversations: Conversation[] } | null>(value: T, id: string): T {
  return value
    ? ({
        ...value,
        conversations: value.conversations.map((conversation) =>
          conversation.id === id ? { ...conversation, unread: 0 } : conversation,
        ),
      } as T)
    : value;
}
