import { useEffect, useRef, useState, type FormEvent, type TouchEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ChevronRight,
  File,
  Menu,
  MessageSquare,
  Plus,
  Settings,
  TimerReset,
  Trash2,
} from "lucide-react";
import {
  api,
  getBootstrap,
  readJson,
  type Bootstrap,
  type Conversation,
  type Message,
  type Project,
} from "./api";
import { horizontalSwipe } from "./swipe";
import { iconButtonClass, conversationFromPath, temporaryFromUrl, chatUrl, navigate } from "./lib";
import { ProjectIcon, Link, ConfirmDialog } from "./ui";
import { MessageView, Thinking } from "./Message";
import { Composer } from "./Composer";

export function SidebarConversation({
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
  const buttonClass =
    "flex h-[41px] cursor-pointer items-center gap-2.5 rounded-[11px] border-0 bg-transparent px-[11px] text-muted transition duration-200 hover:text-text [&_svg]:w-[15px] [&_svg]:shrink-0";
  return (
    <div
      className={`flex items-center rounded-[11px] hover:bg-panel-2 hover:text-text ${nested ? "pl-5" : ""} ${active ? "bg-[color-mix(in_srgb,var(--accent)_11%,var(--panel))] text-text" : ""}`}
    >
      <button className={`${buttonClass} min-w-0 flex-1`} onClick={select}>
        <MessageSquare />
        <span className="truncate text-xs">{item.title}</span>
        {item.unread === 1 && !active && (
          <i className="size-[7px] shrink-0 rounded-full bg-accent" aria-label="新しい応答" />
        )}
      </button>
      <button
        className={`${buttonClass} w-[30px] justify-center p-0 hover:bg-transparent`}
        aria-label={`${item.title}を削除`}
        onClick={remove}
        title="削除"
      >
        <Trash2 />
      </button>
    </div>
  );
}

export function Chat({ initial }: { initial: Bootstrap }) {
  const [data, setData] = useState(initial);
  const initialConversation = initial.conversations.find(
    (item) => item.id === conversationFromPath(),
  );
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversation?.id || null,
  );
  const [projectId, setProjectId] = useState(initialConversation?.project_id || "");
  const [temporary, setTemporary] = useState(temporaryFromUrl);
  const [messages, setMessages] = useState<Message[]>([]);
  const [visibleMessageCount, setVisibleMessageCount] = useState(50);
  const [mobile, setMobile] = useState(() => matchMedia("(max-width: 767px)").matches);
  const [desktopSidebar, setDesktopSidebar] = useState(true);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const sidebar = mobile ? mobileSidebar : desktopSidebar;
  const setSidebar = (open: boolean) => (mobile ? setMobileSidebar(open) : setDesktopSidebar(open));
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    { type: "conversation"; item: Conversation } | { type: "project"; item: Project } | null
  >(null);
  const scrollRef = useRef<HTMLElement>(null);
  const autoScrollRef = useRef(true);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setData(initial);
  }, [initial]);
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
      const protocol = location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${protocol}://${location.host}/api/socket`);
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
          setData((value) => ({
            ...value,
            conversations: value.conversations.map((conversation) =>
              conversation.id === event.conversationId
                ? { ...conversation, generation_status: event.status }
                : conversation,
            ),
          }));
          return;
        }
        if (event.type === "done") {
          const current =
            conversationFromPath() === event.conversationId
              ? api<Message[]>(`/api/conversations/${event.conversationId}`)
              : Promise.resolve(null);
          void Promise.all([getBootstrap(), current])
            .then(([fresh, messages]) => {
              if (!active) return;
              setData(fresh);
              if (messages && conversationFromPath() === event.conversationId)
                setMessages(messages);
            })
            .catch(() => undefined);
          return;
        }
        if (conversationFromPath() !== event.conversationId || !event.content) return;
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
  }, []);
  useEffect(() => {
    const media = matchMedia("(max-width: 767px)");
    const update = () => setMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const syncRoute = () => {
      const id = conversationFromPath();
      const conversation = data.conversations.find((item) => item.id === id);
      if (id && !conversation) {
        navigate(chatUrl("/", temporaryFromUrl()), true);
        return;
      }
      setConversationId(conversation?.id || null);
      setProjectId(conversation?.project_id || "");
      setTemporary(temporaryFromUrl());
    };
    syncRoute();
    addEventListener("popstate", syncRoute);
    return () => removeEventListener("popstate", syncRoute);
  }, [data.conversations]);
  const lastMessage = messages.at(-1);
  const visibleMessages = messages.slice(-visibleMessageCount);
  useEffect(() => {
    if (!autoScrollRef.current) return;
    requestAnimationFrame(() =>
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }),
    );
  }, [lastMessage?.content, lastMessage?.id, sending]);
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
    navigate(chatUrl(`/chat/${item.id}`, isTemporary));
    if (mobile) setMobileSidebar(false);
  }
  function newChat(targetProjectId = "", isTemporary = temporary) {
    autoScrollRef.current = true;
    setEditingMessageId(null);
    setPrompt("");
    setConversationId(null);
    setProjectId(targetProjectId);
    setMessages([]);
    navigate(chatUrl("/", isTemporary));
    if (mobile) setMobileSidebar(false);
  }
  function toggleTemporary() {
    const next = !temporary;
    setTemporary(next);
    newChat("", next);
  }
  async function removeConversation(item: Conversation) {
    await api(`/api/conversations/${item.id}`, { method: "DELETE" });
    setData((value) => ({
      ...value,
      conversations: value.conversations.filter((conversation) => conversation.id !== item.id),
    }));
    if (conversationFromPath() === item.id) newChat();
  }
  async function removeProject(item: Project) {
    await api(`/api/projects/${item.id}`, { method: "DELETE" });
    setData((value) => ({
      ...value,
      projects: value.projects.filter((project) => project.id !== item.id),
      conversations: value.conversations.filter(
        (conversation) => conversation.project_id !== item.id,
      ),
    }));
    if (projectId === item.id) newChat();
  }
  async function refreshChat(id: string) {
    const [fresh, current] = await Promise.all([
      getBootstrap(),
      api<Message[]>(`/api/conversations/${id}`),
    ]);
    setData(fresh);
    setMessages(current);
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
        history.replaceState(null, "", chatUrl(`/chat/${created.id}`, temporary));
        setData((value) => ({ ...value, conversations: [created, ...value.conversations] }));
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
      setMessages((value) => [
        ...value,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `エラー: ${error instanceof Error ? error.message : String(error)}`,
          files: [],
          created_at: new Date().toISOString(),
        },
      ]);
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
      setMessages((value) => [
        ...value,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `停止エラー: ${error instanceof Error ? error.message : String(error)}`,
          files: [],
          created_at: new Date().toISOString(),
        },
      ]);
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
      setMessages((value) => [
        ...value,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `再生成エラー: ${error instanceof Error ? error.message : String(error)}`,
          files: [],
          created_at: new Date().toISOString(),
        },
      ]);
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
    <div
      id="chat-shell"
      className={`flex h-dvh overflow-hidden overscroll-none max-md:block`}
      onTouchStart={startSidebarSwipe}
      onTouchEnd={endSidebarSwipe}
      onTouchCancel={() => (swipeStartRef.current = null)}
    >
      <AnimatePresence>
        {sidebar && (
          <motion.button
            className="fixed inset-0 z-25 hidden border-0 bg-[#0c0d12a6] backdrop-blur-[5px] max-md:block"
            aria-label="メニューを閉じる"
            onClick={() => setMobileSidebar(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>
      <aside
        className={`z-30 flex shrink-0 flex-col overflow-hidden border-r border-line transition-[width] duration-200 bg-[color-mix(in_srgb,var(--panel)_87%,var(--bg))] px-3.5 pt-[18px] pb-3.5 max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:w-[min(310px,86vw)] max-md:-translate-x-[105%] max-md:shadow-[20px_0_70px_#06070a55] max-md:transition-transform max-md:duration-300 max-md:ease-[cubic-bezier(0.22,1,0.36,1)] ${sidebar ? "w-[280px] visible max-md:translate-x-0" : "w-0 invisible"}`}
      >
        <button
          className="mx-0.5 mt-1 mb-6 flex h-[45px] cursor-pointer items-center gap-2.5 rounded-[14px] border border-line bg-panel px-3.5 text-[13px] font-semibold shadow-[0_5px_16px_#2926320a] transition duration-200 hover:-translate-y-px hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))] max-md:hidden [&_svg]:w-[17px] [&_svg]:text-accent"
          onClick={() => newChat()}
        >
          <Plus />
          新しいチャット
        </button>
        <nav className="flex-1 overflow-auto">
          {data.projects.map((group) => (
            <details className="group/details mb-[5px]" key={group.id}>
              <summary className="flex h-[39px] cursor-pointer list-none items-center gap-2 rounded-[11px] px-2.5 text-muted hover:bg-panel-2 hover:text-text [&>svg:first-child]:w-[13px] [&>svg:first-child]:transition-transform group-open/details:[&>svg:first-child]:rotate-90">
                <ChevronRight />
                <ProjectIcon project={group} className="size-[22px]" />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">{group.name}</span>
                <button
                  type="button"
                  className="flex size-[26px] h-7 shrink-0 cursor-pointer items-center justify-center rounded-[11px] border-0 bg-transparent p-0 text-muted transition hover:text-text [&_svg]:w-3.5"
                  aria-label={`${group.name}で新しいチャット`}
                  title="新しいチャット"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    newChat(group.id);
                  }}
                >
                  <Plus />
                </button>
                <button
                  type="button"
                  className="flex size-[26px] h-7 shrink-0 cursor-pointer items-center justify-center rounded-[11px] border-0 bg-transparent p-0 text-muted transition hover:text-text [&_svg]:w-3.5"
                  aria-label={`${group.name}を削除`}
                  title="削除"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setDeleteTarget({ type: "project", item: group });
                  }}
                >
                  <Trash2 />
                </button>
              </summary>
              {data.conversations
                .filter((item) => !item.temporary && item.project_id === group.id)
                .map((item) => (
                  <SidebarConversation
                    key={item.id}
                    item={item}
                    active={item.id === conversationId}
                    nested
                    select={() => selectConversation(item)}
                    remove={() => setDeleteTarget({ type: "conversation", item })}
                  />
                ))}
            </details>
          ))}
          {data.conversations
            .filter((item) => !item.temporary && !item.project_id)
            .map((item) => (
              <SidebarConversation
                key={item.id}
                item={item}
                active={item.id === conversationId}
                select={() => selectConversation(item)}
                remove={() => setDeleteTarget({ type: "conversation", item })}
              />
            ))}
        </nav>
        <Link
          className="mt-2.5 flex items-center gap-2.5 rounded-[15px] p-[9px] transition duration-200 hover:bg-panel-2 [&>img]:block [&>img]:size-[34px] [&>img]:rounded-[11px] [&>img]:object-cover [&>svg]:w-4 [&>svg]:text-muted"
          href="/settings/projects"
        >
          {data.user.avatar ? (
            <img src={data.user.avatar} alt="" />
          ) : (
            <span className="flex size-[34px] items-center justify-center rounded-[11px] bg-panel-2 font-bold">
              {data.user.display_name[0]}
            </span>
          )}
          <span className="flex min-w-0 flex-1 flex-col">
            <strong className="truncate text-xs">{data.user.display_name}</strong>
          </span>
          <Settings />
        </Link>
      </aside>

      <AnimatePresence>
        {deleteTarget && (
          <ConfirmDialog
            title={deleteTarget.type === "project" ? "プロジェクトを削除" : "チャットを削除"}
            text={
              deleteTarget.type === "project"
                ? `「${deleteTarget.item.name}」と中のチャット・ファイルを削除します。`
                : `「${deleteTarget.item.title}」と添付ファイルを削除します。`
            }
            close={() => setDeleteTarget(null)}
            onConfirm={async () => {
              if (deleteTarget.type === "project") await removeProject(deleteTarget.item);
              else await removeConversation(deleteTarget.item);
            }}
          />
        )}
      </AnimatePresence>

      <main className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_50%_0,#c15f3c08,transparent_34%)]">
        <header className="z-10 flex h-16 shrink-0 items-center gap-2 border-b border-[color-mix(in_srgb,var(--line)_62%,transparent)] bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] px-[22px] backdrop-blur-[18px] max-md:h-[58px] max-md:px-2.5">
          <button
            className={iconButtonClass}
            onClick={() => setSidebar(!sidebar)}
            aria-label={sidebar ? "サイドバーを閉じる" : "サイドバーを開く"}
          >
            <Menu />
          </button>
          <button
            className={`${iconButtonClass} hidden max-md:flex`}
            onClick={() => newChat()}
            aria-label="新しいチャット"
            title="新しいチャット"
          >
            <Plus />
          </button>
          {project && (
            <div className="flex h-10 min-w-0 max-w-[280px] items-center gap-2 px-2 text-[13px] font-semibold">
              <ProjectIcon project={project} className="size-[26px]" />
              <span className="truncate">{project.name}</span>
            </div>
          )}
          <button
            className={`${iconButtonClass} ml-auto ${temporary ? "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-accent" : ""}`}
            onClick={toggleTemporary}
            aria-label={temporary ? "一時チャットを終了" : "一時チャットを開始"}
            title="一時チャット"
          >
            <TimerReset />
          </button>
        </header>
        <section
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-none scroll-smooth"
          onScroll={(event) => {
            const element = event.currentTarget;
            autoScrollRef.current =
              element.scrollHeight - element.scrollTop - element.clientHeight < 120;
          }}
        >
          {messages.length > 0 && (
            <div className="mx-auto w-[min(820px,calc(100%-32px))] pt-11 pb-10 max-md:pt-[27px]">
              {visibleMessages.length < messages.length && (
                <button
                  className="mx-auto mb-8 block cursor-pointer rounded-[10px] border border-line bg-panel px-3.5 py-2 text-[11px] text-muted"
                  onClick={() => setVisibleMessageCount((count) => count + 50)}
                >
                  以前のメッセージを表示
                </button>
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
        </section>
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
      </main>
    </div>
  );
}
