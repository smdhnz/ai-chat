import {
  useEffect,
  useId,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ComponentProps,
  type FormEvent,
  type TouchEvent,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Briefcase,
  Check,
  ChevronRight,
  Code2,
  Copy,
  File,
  Folder,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  MoreHorizontal,
  Palette,
  Paperclip,
  Pencil,
  Plus,
  Rocket,
  RotateCcw,
  Settings,
  Sparkles,
  Square,
  Sun,
  TimerReset,
  Trash2,
  X,
} from "lucide-react";
import {
  api,
  getBootstrap,
  parseDeviceAuth,
  readJson,
  type Bootstrap,
  type Conversation,
  type DeviceAuth,
  type FileItem,
  type Message,
  type Project,
  type Skill,
  type ThinkingLevel,
} from "./api";
import { horizontalSwipe } from "./swipe";
const ease = [0.22, 1, 0.36, 1] as const;
const iconButtonClass =
  "grid size-10 shrink-0 cursor-pointer place-items-center rounded-[13px] border-0 bg-transparent transition duration-200 ease-out hover:-translate-y-px hover:bg-panel-2 [&_svg]:w-5";
const projectColorClasses = {
  clay: "[--project-color:#c15f3c]",
  blue: "[--project-color:#4d78c8]",
  green: "[--project-color:#4b8b62]",
  purple: "[--project-color:#8064b3]",
  gold: "[--project-color:#b8862f]",
  rose: "[--project-color:#b85d79]",
} as const;

const projectIcons = {
  folder: Folder,
  briefcase: Briefcase,
  code: Code2,
  book: BookOpen,
  palette: Palette,
  rocket: Rocket,
};
const projectColors = ["clay", "blue", "green", "purple", "gold", "rose"] as const;

function ProjectIcon({ project, className = "" }: { project?: Project; className?: string }) {
  const Icon = projectIcons[project?.icon as keyof typeof projectIcons] || Folder;
  const color = project?.color as keyof typeof projectColorClasses;
  return (
    <span
      className={`inline-grid size-9 shrink-0 place-items-center rounded-[11px] bg-[color-mix(in_srgb,var(--project-color)_13%,var(--panel))] text-[var(--project-color)] [&_svg]:w-4 ${projectColorClasses[color] || projectColorClasses.clay} ${className}`}
    >
      <Icon />
    </span>
  );
}

function conversationFromPath(): string | null {
  return location.pathname.match(/^\/chat\/([\w-]+)$/)?.[1] || null;
}

type SettingsTab = "projects" | "skills" | "files" | "general";
const settingsTabFromPath = (): SettingsTab => {
  const tab = location.pathname.match(/^\/settings\/(projects|skills|files|general)$/)?.[1];
  return (tab as SettingsTab) || "projects";
};
const temporaryFromUrl = () => new URLSearchParams(location.search).get("temporary") === "1";
const chatUrl = (path: string, temporary: boolean) => `${path}${temporary ? "?temporary=1" : ""}`;

function navigate(url: string, replace = false) {
  history[replace ? "replaceState" : "pushState"](null, "", url);
  dispatchEvent(new PopStateEvent("popstate"));
}

function Link({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        if (
          event.button ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          props.target
        )
          return;
        event.preventDefault();
        navigate(href);
      }}
    />
  );
}

function useTheme() {
  const [dark, setDark] = useState(() => localStorage.theme === "dark");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.theme = dark ? "dark" : "light";
  }, [dark]);
  return { dark, toggle: () => setDark((value) => !value) };
}

function ThemeButton({ dark, toggle }: { dark: boolean; toggle: () => void }) {
  const label = dark ? "ライトテーマに変更" : "ダークテーマに変更";
  return (
    <button className={iconButtonClass} onClick={toggle} aria-label={label} title={label}>
      {dark ? <Sun /> : <Moon />}
    </button>
  );
}

function Login() {
  const error = new URLSearchParams(location.search).get("error");
  return (
    <main className="relative grid min-h-svh place-items-center overflow-hidden p-6">
      <motion.section
        className="relative w-[min(360px,100%)] text-center [&_h1]:mb-9 [&_h1]:text-[32px] [&_h1]:font-semibold [&_h1]:tracking-[-0.04em]"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease }}
      >
        <h1>Chat</h1>
        <a
          className="flex h-[50px] items-center justify-center rounded-xl bg-accent text-sm font-semibold text-white transition-colors duration-200 hover:bg-accent-2"
          href="/api/auth/discord"
        >
          Discordでログイン
        </a>
        {error && (
          <p className="mt-3.5 text-[13px] text-[#b54e4e]">
            {error === "forbidden"
              ? "このアカウントは利用できません。"
              : "ログインに失敗しました。"}
          </p>
        )}
      </motion.section>
    </main>
  );
}

function SidebarConversation({
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

function Chat({ initial }: { initial: Bootstrap }) {
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
      className={`grid h-full overflow-hidden overscroll-none transition-[grid-template-columns] duration-200 max-md:block ${sidebar ? "grid-cols-[280px_1fr]" : "grid-cols-[0_1fr]"}`}
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
        className={`z-30 flex min-w-0 flex-col overflow-hidden border-r border-line bg-[color-mix(in_srgb,var(--panel)_87%,var(--bg))] px-3.5 pt-[18px] pb-3.5 max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:w-[min(310px,86vw)] max-md:-translate-x-[105%] max-md:shadow-[20px_0_70px_#06070a55] max-md:transition-transform max-md:duration-300 max-md:ease-[cubic-bezier(0.22,1,0.36,1)] ${sidebar ? "visible max-md:translate-x-0" : "invisible"}`}
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
          className="mt-2.5 flex items-center gap-2.5 rounded-[15px] p-[9px] transition duration-200 hover:bg-panel-2 [&>img]:grid [&>img]:size-[34px] [&>img]:place-items-center [&>img]:rounded-[11px] [&>img]:object-cover [&>svg]:w-4 [&>svg]:text-muted"
          href="/settings/projects"
        >
          {data.user.avatar ? (
            <img src={data.user.avatar} alt="" />
          ) : (
            <span className="grid size-[34px] place-items-center rounded-[11px] bg-panel-2 font-bold">
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

      <main className="relative grid h-full min-h-0 min-w-0 grid-rows-[64px_minmax(0,1fr)_auto] overflow-hidden bg-[radial-gradient(circle_at_50%_0,#c15f3c08,transparent_34%)] max-md:grid-rows-[58px_minmax(0,1fr)_auto]">
        <header className="z-10 flex items-center gap-2 border-b border-[color-mix(in_srgb,var(--line)_62%,transparent)] bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] px-[22px] backdrop-blur-[18px] max-md:h-[58px] max-md:px-2.5">
          <button
            className={iconButtonClass}
            onClick={() => setSidebar(!sidebar)}
            aria-label={sidebar ? "サイドバーを閉じる" : "サイドバーを開く"}
          >
            <Menu />
          </button>
          <button
            className={`${iconButtonClass} hidden max-md:grid`}
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
          className="min-h-0 overflow-y-auto overscroll-none scroll-smooth"
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

function MessageView({
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
              className={`min-w-0 max-w-full text-sm leading-[1.78] max-md:text-[13px] [&_a]:text-accent [&_a]:underline [&_code:not(pre_code)]:rounded-[5px] [&_code:not(pre_code)]:bg-panel-2 [&_code:not(pre_code)]:px-[5px] [&_code:not(pre_code)]:py-0.5 [&_code:not(pre_code)]:text-[0.88em] [&_ol]:pl-5 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_td]:border [&_td]:border-line [&_td]:px-[9px] [&_td]:py-[7px] [&_td]:text-left [&_th]:border [&_th]:border-line [&_th]:px-[9px] [&_th]:py-[7px] [&_th]:text-left [&_ul]:pl-5 ${isUser ? "rounded-[20px_20px_6px_20px] border border-[color-mix(in_srgb,var(--accent)_16%,var(--line))] bg-[color-mix(in_srgb,var(--accent)_9%,var(--panel))] px-4 py-[11px] shadow-[0_6px_20px_#5b403010]" : ""} ${collapsible && !expanded ? "max-h-56 overflow-hidden [mask-image:linear-gradient(#000_75%,transparent)]" : ""}`}
            >
              {message.skills && message.skills.length > 0 && (
                <div className="mb-2 flex items-center gap-1.5 text-[10px] text-accent [&_svg]:w-[13px] [&_span]:rounded-full [&_span]:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] [&_span]:px-[7px] [&_span]:py-[3px]">
                  <Sparkles />
                  {message.skills.map((skill) => (
                    <span key={skill}>{skill}</span>
                  ))}
                </div>
              )}
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: CodeBlock }}>
                {content}
              </ReactMarkdown>
              {auth && <AuthCard auth={auth} />}
            </div>
            {collapsible && (
              <button
                className="mt-[5px] cursor-pointer border-0 bg-transparent px-[7px] py-1 text-[10px] text-muted"
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
          <div className="mt-[3px] flex self-end [&_button]:grid [&_button]:size-7 [&_button]:cursor-pointer [&_button]:place-items-center [&_button]:rounded-lg [&_button]:border-0 [&_button]:bg-transparent [&_button]:p-0 [&_button]:text-muted [&_button:disabled]:cursor-default [&_button:disabled]:opacity-35 [&_button:hover:not(:disabled)]:bg-panel-2 [&_button:hover:not(:disabled)]:text-text [&_svg]:w-3.5">
            <button
              onClick={regenerate}
              disabled={disabled}
              aria-label="このメッセージから再生成"
              title="このメッセージから再生成"
            >
              <RotateCcw />
            </button>
            <button
              onClick={edit}
              disabled={disabled}
              aria-label="このメッセージを編集して再生成"
              title="このメッセージを編集して再生成"
            >
              <Pencil />
            </button>
          </div>
        )}
      </div>
    </motion.article>
  );
}

function useCopy() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return {
    copied,
    copy(text: string) {
      void navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2_000);
    },
  };
}

function CodeBlock({ children, ...props }: ComponentProps<"pre">) {
  const copy = useCopy();
  const code = useRef<HTMLPreElement>(null);
  return (
    <div className="relative">
      <button
        className="absolute top-2 right-2 z-1 grid size-7 cursor-pointer place-items-center rounded-[7px] border border-line bg-panel [&_svg]:w-3.5"
        type="button"
        aria-label="コードをコピー"
        title="コードをコピー"
        onClick={() => copy.copy(code.current?.innerText ?? "")}
      >
        {copy.copied ? <Check /> : <Copy />}
      </button>
      <pre
        className="overflow-auto rounded-[14px] border border-line bg-panel-2 py-4 pr-[52px] pl-4 text-xs leading-[1.6]"
        ref={code}
        {...props}
      >
        {children}
      </pre>
    </div>
  );
}

function AuthCard({ auth }: { auth: DeviceAuth }) {
  const copy = useCopy();
  return (
    <div className="mt-[15px] grid gap-2.5 rounded-[17px] border border-[color-mix(in_srgb,#e4a356_38%,var(--line))] bg-[color-mix(in_srgb,#e4a356_8%,var(--panel))] p-[17px]">
      <div className="flex items-center gap-[9px]">
        <span className="size-2 animate-pulse rounded-full bg-[#e4a356] shadow-[0_0_0_5px_#e4a35620]" />
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
        className="flex w-full cursor-pointer items-center justify-between rounded-[11px] border border-line bg-panel px-3 py-2.5 [&_svg]:w-4"
        type="button"
        aria-label="認証コードをコピー"
        title="認証コードをコピー"
        onClick={() => copy.copy(auth.userCode)}
      >
        <code>{auth.userCode}</code>
        {copy.copied ? <Check /> : <Copy />}
      </button>
    </div>
  );
}

function FileBlocks({ files, alignEnd = false }: { files: FileItem[]; alignEnd?: boolean }) {
  const [preview, setPreview] = useState<FileItem | null>(null);
  const previewUrl = preview?.preview || (preview?.id ? `/files/${preview.id}` : "");
  return (
    <>
      <div
        className={`flex max-w-full flex-nowrap gap-[9px] overflow-x-auto pb-[5px] ${alignEnd ? "mb-2 justify-end" : "mt-3"}`}
      >
        {files.map((file) =>
          file.mime.startsWith("image/") && (file.id || file.preview) ? (
            <button
              key={file.id || file.name}
              className="shrink-0 cursor-zoom-in rounded-[14px] border-0 bg-transparent p-0 [&_img]:block [&_img]:h-auto [&_img]:max-h-[210px] [&_img]:max-w-80 [&_img]:rounded-[14px] [&_img]:border [&_img]:border-line [&_img]:object-cover [&_img]:shadow-[0_24px_70px_#4c392718] max-md:[&_img]:max-h-[170px] max-md:[&_img]:max-w-[260px] dark:[&_img]:shadow-[0_28px_80px_#100d0966]"
              onClick={() => setPreview(file)}
              aria-label={`${file.name}を拡大表示`}
            >
              <img src={file.preview || `/files/${file.id}`} alt={file.name} />
            </button>
          ) : (
            <a
              key={file.id || file.name}
              className="flex shrink-0 items-center gap-2 rounded-xl border border-line bg-panel px-3 py-[9px] [&_svg]:w-4 [&_svg]:text-accent"
              href={file.id ? `/files/${file.id}` : undefined}
              target="_blank"
            >
              <File />
              <span>{file.name}</span>
            </a>
          ),
        )}
      </div>
      <AnimatePresence>
        {preview && (
          <motion.button
            className="fixed inset-0 z-80 grid size-full cursor-zoom-out place-items-center border-0 bg-[#090a0dcc] p-7 backdrop-blur-[7px] [&_img]:block [&_img]:h-auto [&_img]:max-h-[calc(100dvh-56px)] [&_img]:w-auto [&_img]:max-w-[calc(100vw-56px)] [&_img]:object-contain"
            onClick={() => setPreview(null)}
            aria-label="拡大表示を閉じる"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <img src={previewUrl} alt={preview.name} />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}

function Thinking() {
  const dotClass = "size-1.5 animate-bounce rounded-full bg-muted";
  return (
    <motion.div
      className="mb-7 flex gap-3.5 max-md:mb-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="flex h-[30px] items-center gap-[5px]">
        <i className={dotClass} />
        <i className={`${dotClass} [animation-delay:150ms]`} />
        <i className={`${dotClass} [animation-delay:300ms]`} />
      </div>
    </motion.div>
  );
}

function Composer(props: {
  prompt: string;
  setPrompt: (v: string) => void;
  files: File[];
  setFiles: (v: File[]) => void;
  temporary: boolean;
  mobile: boolean;
  ctrlEnterSend: boolean;
  generating: boolean;
  editing: boolean;
  cancelEditing: () => void;
  stop: () => Promise<void>;
  send: (e: FormEvent) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <footer className="z-5 mx-auto w-[min(850px,calc(100%-32px))] pb-[max(10px,env(safe-area-inset-bottom))] transition-[width] max-md:w-[calc(100%-64px)] max-md:pb-[max(7px,env(safe-area-inset-bottom))] max-md:focus-within:w-[calc(100%-18px)]">
      <form
        className={`overflow-hidden rounded-[22px] border bg-glass shadow-[0_15px_50px_#28253318] backdrop-blur-[22px] max-md:rounded-[18px] ${props.temporary ? "border-2 border-dashed border-[color-mix(in_srgb,var(--accent)_55%,var(--line))]" : "border-line"}`}
        onSubmit={props.send}
      >
        {props.temporary && (
          <span className="mx-3.5 mt-2.5 mb-[-6px] flex w-max items-center gap-[5px] text-[9px] font-bold text-accent [&_svg]:w-3">
            <TimerReset />
            一時チャット
          </span>
        )}
        {props.editing && (
          <div className="mx-3.5 mt-2.5 mb-[-5px] flex items-center gap-1.5 text-[10px] text-accent [&_svg]:w-[13px]">
            <Pencil />
            選択したメッセージを編集中
            <button
              className="ml-auto cursor-pointer border-0 bg-transparent text-muted"
              type="button"
              onClick={props.cancelEditing}
            >
              キャンセル
            </button>
          </div>
        )}
        {props.files.length > 0 && (
          <div className="flex gap-[7px] overflow-x-auto px-2.5 pt-2.5 [&>span]:flex [&>span]:h-[30px] [&>span]:max-w-[220px] [&>span]:items-center [&>span]:gap-1.5 [&>span]:whitespace-nowrap [&>span]:rounded-[9px] [&>span]:bg-panel-2 [&>span]:pr-[7px] [&>span]:pl-[9px] [&>span]:text-[10px] [&>span>svg]:w-[13px] [&>span>svg]:shrink-0 [&_button]:cursor-pointer [&_button]:border-0 [&_button]:bg-transparent [&_button]:p-0.5 [&_button_svg]:w-3">
            {props.files.map((file, index) => (
              <span key={`${file.name}-${index}`}>
                <File />
                {file.name}
                <button
                  type="button"
                  onClick={() => props.setFiles(props.files.filter((_, i) => i !== index))}
                >
                  <X />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="max-md:grid max-md:grid-cols-[auto_minmax(0,1fr)_auto] max-md:items-end">
          <textarea
            className="block min-h-[50px] max-h-[180px] w-full resize-none border-0 bg-transparent px-[17px] pt-[15px] pb-[7px] text-sm leading-[1.6] text-text outline-0 placeholder:text-muted focus-visible:outline-none max-md:col-start-2 max-md:row-start-1 max-md:min-h-12 max-md:min-w-0 max-md:px-2 max-md:pt-[11px] max-md:pb-2 max-md:text-base"
            value={props.prompt}
            onChange={(event) => {
              props.setPrompt(event.target.value);
              event.target.style.height = "auto";
              event.target.style.height = `${Math.min(event.target.scrollHeight, 180)}px`;
            }}
            onPaste={(event) => {
              if (props.editing) return;
              const images = Array.from(event.clipboardData.files).filter((file) =>
                file.type.startsWith("image/"),
              );
              if (images.length) {
                event.preventDefault();
                props.setFiles([...props.files, ...images]);
              }
            }}
            onKeyDown={(event) => {
              if (props.mobile || event.key !== "Enter") return;
              const send = props.ctrlEnterSend ? event.ctrlKey : !event.shiftKey;
              if (send) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="メッセージを入力"
            rows={1}
          />
          <div className="flex h-[45px] items-center gap-[3px] px-2 pt-[3px] pb-[7px] max-md:contents">
            <input
              ref={input}
              type="file"
              multiple
              hidden
              onChange={(event) =>
                props.setFiles([...props.files, ...Array.from(event.target.files || [])])
              }
            />
            {!props.editing && (
              <button
                type="button"
                className="flex h-[34px] cursor-pointer items-center gap-1.5 rounded-[10px] border-0 bg-transparent px-[9px] text-[11px] text-muted transition duration-200 hover:bg-panel-2 hover:text-text max-md:col-start-1 max-md:row-start-1 max-md:mr-0 max-md:mb-[7px] max-md:ml-2 [&_svg]:w-4"
                onClick={() => input.current?.click()}
                aria-label="ファイルを添付"
                title="ファイルを添付"
              >
                <Paperclip />
              </button>
            )}
            <span className="flex-1 max-md:hidden" />
            {props.generating ? (
              <button
                type="button"
                className="grid size-[34px] cursor-pointer place-items-center rounded-[11px] border-0 bg-accent text-white shadow-[0_7px_18px_color-mix(in_srgb,var(--accent)_30%,transparent)] transition duration-200 hover:-translate-y-0.5 max-md:col-start-3 max-md:row-start-1 max-md:mr-2 max-md:mb-[7px] [&_svg]:w-3 [&_svg]:fill-current"
                onClick={() => void props.stop()}
                aria-label="生成を停止"
                title="生成を停止"
              >
                <Square />
              </button>
            ) : (
              <button
                className="grid size-[34px] cursor-pointer place-items-center rounded-[11px] border-0 bg-accent text-white shadow-[0_7px_18px_color-mix(in_srgb,var(--accent)_30%,transparent)] transition duration-200 hover:not-disabled:-translate-y-0.5 disabled:opacity-30 disabled:shadow-none max-md:col-start-3 max-md:row-start-1 max-md:mr-2 max-md:mb-[7px] [&_svg]:w-[17px]"
                disabled={!props.prompt.trim() && !props.files.length}
                aria-label={props.editing ? "編集して再生成" : "送信"}
              >
                <ArrowUp />
              </button>
            )}
          </div>
        </div>
      </form>
    </footer>
  );
}

function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const titleId = useId();
  return (
    <motion.div
      className="fixed inset-0 z-60 grid place-items-center bg-[#0c0d12a6] p-[18px] backdrop-blur-[5px] max-md:items-end max-md:p-0"
      onMouseDown={close}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="max-h-[min(760px,90svh)] w-[min(510px,100%)] overflow-auto rounded-3xl border border-line bg-panel shadow-[0_30px_100px_#06070a70] max-md:max-h-[88svh] max-md:w-full max-md:rounded-[25px_25px_0_0] max-md:border-b-0"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.3, ease }}
      >
        <header className="flex h-[62px] items-center border-b border-line pr-[18px] pl-[22px]">
          <strong className="flex-1" id={titleId}>
            {title}
          </strong>
          <button className={iconButtonClass} onClick={close}>
            <X />
          </button>
        </header>
        {children}
      </motion.div>
    </motion.div>
  );
}

function ConfirmDialog({
  title,
  text,
  close,
  onConfirm,
}: {
  title: string;
  text: string;
  close: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title={title} close={close}>
      <div className="p-[22px]">
        <p className="m-0 text-[13px] leading-[1.7] text-muted">{text}</p>
        {error && <p className="mt-2.5 text-[13px] text-[#d15f6b]">{error}</p>}
        <div className="mt-[22px] flex justify-end gap-2 [&_button]:flex [&_button]:h-[38px] [&_button]:cursor-pointer [&_button]:items-center [&_button]:gap-1.5 [&_button]:rounded-[11px] [&_button]:border [&_button]:border-line [&_button]:bg-transparent [&_button]:px-3.5 [&_button]:text-text [&_button:disabled]:opacity-50 [&_svg]:w-3.5">
          <button onClick={close} disabled={deleting}>
            キャンセル
          </button>
          <button
            className="border-[color-mix(in_srgb,#de6b76_35%,var(--line))]! bg-[color-mix(in_srgb,#de6b76_10%,transparent)]! text-[#d15f6b]!"
            disabled={deleting}
            onClick={async () => {
              setDeleting(true);
              try {
                await onConfirm();
                close();
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : String(reason));
                setDeleting(false);
              }
            }}
          >
            <Trash2 />
            {deleting ? "削除中" : "削除"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function SettingsPage({
  initial,
  theme,
}: {
  initial: Bootstrap;
  theme: ReturnType<typeof useTheme>;
}) {
  const [data, setData] = useState(initial);
  const [language, setLanguage] = useState(initial.user.language);
  const [ctrlEnterSend, setCtrlEnterSend] = useState(initial.user.ctrl_enter_send === 1);
  const [model, setModel] = useState(initial.user.model);
  const [thinking, setThinking] = useState(initial.user.thinking_level);
  const tab = settingsTabFromPath();
  const [editor, setEditor] = useState<{
    type: "project" | "skill";
    item?: Project | Skill;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "projects" | "skills" | "data";
    id: string;
    name: string;
  } | null>(null);
  const [toast, setToast] = useState("");
  const settingsSaveTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const settingsSaveRevision = useRef(0);
  useEffect(() => setData(initial), [initial]);
  function autoSaveSettings(
    nextLanguage: string,
    nextCtrlEnterSend: boolean,
    nextModel: string,
    nextThinking: ThinkingLevel,
  ) {
    const revision = ++settingsSaveRevision.current;
    clearTimeout(settingsSaveTimeout.current);
    settingsSaveTimeout.current = setTimeout(() => {
      void api<{
        language: string;
        ctrl_enter_send: number;
        model: string;
        thinking_level: ThinkingLevel;
      }>("/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          language: nextLanguage,
          ctrlEnterSend: nextCtrlEnterSend,
          model: nextModel,
          thinking: nextThinking,
        }),
      })
        .then((saved) => {
          if (revision !== settingsSaveRevision.current) return;
          setLanguage(saved.language);
          setCtrlEnterSend(saved.ctrl_enter_send === 1);
          setModel(saved.model);
          setThinking(saved.thinking_level);
          setToast("自動保存しました");
          setTimeout(() => setToast(""), 2200);
        })
        .catch((error: Error) => {
          if (revision === settingsSaveRevision.current)
            setToast(`保存できませんでした: ${error.message}`);
        });
    }, 500);
  }
  async function refresh(message?: string) {
    const value = await getBootstrap();
    setData(value);
    if (message) {
      setToast(message);
      setTimeout(() => setToast(""), 2200);
    }
  }
  async function remove(type: "projects" | "skills" | "data", objectId: string) {
    const path = type === "data" ? "/api/data" : `/api/${type}/${objectId}`;
    await api(path, { method: "DELETE" });
    await refresh("削除しました");
  }
  const settingRowClass =
    "flex min-h-[70px] items-center gap-5 border-t border-line py-[15px] first:border-t-0 [&>span]:flex-1 [&>span]:text-[10px] [&>span]:font-bold [&>span]:text-text";
  const settingControlClass =
    "h-[38px] w-[min(320px,55%)] rounded-[11px] border border-line bg-bg px-[11px] text-text outline-none focus:border-accent max-md:w-[55%]";
  return (
    <div className="relative min-h-svh">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_0,#c15f3c12,transparent_38%)]" />
      <main className="relative z-1 mx-auto w-[min(1060px,calc(100%-40px))] pt-9 pb-20 max-md:w-[calc(100%-26px)] max-md:pt-5">
        <header className="mb-[30px] flex items-center">
          <Link
            href="/"
            className="grid size-10 place-items-center rounded-[13px] border border-line bg-panel text-muted transition duration-200 hover:-translate-x-0.5 hover:text-text [&_svg]:w-[18px]"
            aria-label="チャットに戻る"
            title="チャットに戻る"
          >
            <ArrowLeft />
          </Link>
        </header>
        <nav className="mb-[38px] flex w-max gap-1 rounded-[15px] border border-line bg-[color-mix(in_srgb,var(--panel)_65%,transparent)] p-[5px] backdrop-blur-[18px] max-md:mb-7 max-md:w-full max-md:justify-start max-md:overflow-x-auto">
          {(["projects", "skills", "files", "general"] as const).map((item) => (
            <Link
              className={`flex h-[35px] cursor-pointer items-center rounded-[10px] px-[17px] text-[11px] font-semibold text-muted transition duration-200 max-md:flex-1 max-md:justify-center max-md:px-[13px] ${tab === item ? "bg-panel text-text shadow-[0_4px_14px_#27243112]" : ""}`}
              href={`/settings/${item}`}
              key={item}
            >
              {
                {
                  projects: "プロジェクト",
                  skills: "スキル",
                  files: "ファイル",
                  general: "一般",
                }[item]
              }
            </Link>
          ))}
        </nav>
        <AnimatePresence mode="wait">
          <motion.section
            key={tab}
            className="min-h-[420px]"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
          >
            {tab === "projects" && (
              <>
                <PanelTitle
                  title="プロジェクト"
                  text="会話ごとのシステムプロンプトを設定します。"
                  action={() => setEditor({ type: "project" })}
                  actionText="作成"
                />
                <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
                  {data.projects.map((item) => (
                    <SettingsCard
                      key={item.id}
                      icon={<ProjectIcon project={item} />}
                      title={item.name}
                      text={item.system_prompt || "カスタム指示なし"}
                      edit={() => setEditor({ type: "project", item })}
                      remove={() =>
                        setDeleteTarget({ type: "projects", id: item.id, name: item.name })
                      }
                    />
                  ))}
                </div>
              </>
            )}
            {tab === "skills" && (
              <>
                <PanelTitle
                  title="スキル"
                  text="有効なスキルはすべての会話と画像プロンプトに適用されます。"
                  action={() => setEditor({ type: "skill" })}
                  actionText="追加"
                />
                <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
                  {data.skills.map((item) => (
                    <SettingsCard
                      key={item.id}
                      icon={<Sparkles />}
                      title={item.name}
                      text={item.description || item.instructions}
                      badge={item.enabled ? "有効" : "無効"}
                      edit={() => setEditor({ type: "skill", item })}
                      remove={() =>
                        setDeleteTarget({ type: "skills", id: item.id, name: item.name })
                      }
                    />
                  ))}
                </div>
              </>
            )}
            {tab === "files" && (
              <>
                <PanelTitle title="ファイル" text="アップロードしたファイルと生成画像です。" />
                <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
                  {data.files.map((file) => (
                    <a
                      className="min-w-0 overflow-hidden rounded-[17px] border border-line bg-panel transition duration-200 hover:-translate-y-[3px] hover:shadow-[0_24px_70px_#4c392718] dark:hover:shadow-[0_28px_80px_#100d0966]"
                      href={`/files/${file.id}`}
                      target="_blank"
                      key={file.id}
                    >
                      {file.mime.startsWith("image/") ? (
                        <img
                          className="grid aspect-4/3 w-full place-items-center object-cover"
                          src={`/files/${file.id}`}
                          alt={file.name}
                          loading="lazy"
                        />
                      ) : (
                        <span className="grid aspect-4/3 w-full place-items-center bg-panel-2 [&_svg]:w-[35px] [&_svg]:text-muted">
                          <File />
                        </span>
                      )}
                      <div className="flex flex-col px-[11px] py-2.5">
                        <strong className="truncate text-[10px]">{file.name}</strong>
                        <small className="mt-[3px] text-[8px] text-muted">
                          {file.source === "generated" ? "生成画像" : "アップロード"} ·{" "}
                          {formatSize(file.size)}
                        </small>
                      </div>
                    </a>
                  ))}
                </div>
              </>
            )}
            {tab === "general" && (
              <>
                <PanelTitle title="一般" text="回答とアカウントの設定です。" />
                <div className="border-b border-line">
                  <div className={settingRowClass}>
                    <span>テーマ</span>
                    <ThemeButton {...theme} />
                  </div>
                  <div className={settingRowClass}>
                    <span>回答言語</span>
                    <input
                      className={settingControlClass}
                      id="response-language"
                      aria-label="回答言語"
                      type="text"
                      value={language}
                      onChange={(event) => {
                        setLanguage(event.target.value);
                        autoSaveSettings(event.target.value, ctrlEnterSend, model, thinking);
                      }}
                      maxLength={80}
                      placeholder="Japanese"
                    />
                  </div>
                  <div className={settingRowClass}>
                    <span>モデル</span>
                    <select
                      className={settingControlClass}
                      id="codex-model"
                      aria-label="モデル"
                      value={model}
                      onChange={(event) => {
                        setModel(event.target.value);
                        autoSaveSettings(language, ctrlEnterSend, event.target.value, thinking);
                      }}
                    >
                      {data.models.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={settingRowClass}>
                    <span>Thinking</span>
                    <select
                      className={settingControlClass}
                      id="thinking-level"
                      aria-label="Thinking"
                      value={thinking}
                      onChange={(event) => {
                        const value = event.target.value as ThinkingLevel;
                        setThinking(value);
                        autoSaveSettings(language, ctrlEnterSend, model, value);
                      }}
                    >
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                  <div className={settingRowClass}>
                    <span className="grid! gap-0.5">
                      Ctrl + Enterで送信
                      <small className="text-[8px] font-normal text-muted">
                        PCのみ。スマートフォンではEnterで改行します。
                      </small>
                    </span>
                    <input
                      className="relative m-0 h-[22px] w-[38px] shrink-0 cursor-pointer appearance-none rounded-[20px] bg-panel-2 after:absolute after:top-[3px] after:left-[3px] after:size-4 after:rounded-full after:bg-muted after:content-[''] after:transition-[left] checked:bg-accent checked:after:left-[19px] checked:after:bg-white"
                      type="checkbox"
                      aria-label="Ctrl + Enterで送信"
                      checked={ctrlEnterSend}
                      onChange={(event) => {
                        setCtrlEnterSend(event.target.checked);
                        autoSaveSettings(language, event.target.checked, model, thinking);
                      }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-[15px] border-b border-line py-[18px] max-md:flex-wrap max-md:items-start [&>img]:size-[54px] [&>img]:rounded-[17px] [&>img]:object-cover">
                  {data.user.avatar ? (
                    <img src={data.user.avatar} alt="" />
                  ) : (
                    <span className="grid size-[54px] place-items-center rounded-[17px] bg-panel-2 font-bold">
                      {data.user.display_name[0]}
                    </span>
                  )}
                  <div className="flex-1">
                    <h2 className="mb-1 text-base">{data.user.display_name}</h2>
                    <p className="text-[11px] text-muted">@{data.user.username}</p>
                  </div>
                  <form className="max-md:w-full" method="post" action="/logout">
                    <button className="flex h-[38px] cursor-pointer items-center gap-[7px] rounded-[11px] border border-[color-mix(in_srgb,#de6b76_28%,var(--line))] bg-transparent px-3 text-[10px] text-[#d15f6b] max-md:w-full max-md:justify-center [&_svg]:w-3.5">
                      <LogOut />
                      ログアウト
                    </button>
                  </form>
                </div>
                <section className="flex items-center gap-2 py-[18px] max-md:flex-col max-md:items-stretch">
                  <div className="flex-1">
                    <h2 className="mb-[3px] text-[13px]">データ削除</h2>
                    <p className="text-[9px] text-muted">この操作は取り消せません。</p>
                  </div>
                  <button
                    className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-[10px] border border-[color-mix(in_srgb,#de6b76_30%,var(--line))] bg-transparent px-2.5 text-[9px] text-[#d15f6b] max-md:justify-center [&_svg]:w-[13px]"
                    onClick={() =>
                      setDeleteTarget({ type: "data", id: "", name: "すべてのデータ" })
                    }
                  >
                    <Trash2 />
                    データを削除
                  </button>
                </section>
              </>
            )}
          </motion.section>
        </AnimatePresence>
      </main>
      <AnimatePresence>
        {deleteTarget && (
          <ConfirmDialog
            title={
              {
                projects: "プロジェクトを削除",
                skills: "スキルを削除",
                data: "データを削除",
              }[deleteTarget.type]
            }
            text={
              {
                projects: `「${deleteTarget.name}」と中のチャット・ファイルを削除します。`,
                skills: `「${deleteTarget.name}」を削除します。`,
                data: "すべてのプロジェクト・チャット・ファイルを削除します。スキルとアカウント設定は残ります。",
              }[deleteTarget.type]
            }
            close={() => setDeleteTarget(null)}
            onConfirm={() => remove(deleteTarget.type, deleteTarget.id)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {editor && (
          <Editor
            editor={editor}
            close={() => setEditor(null)}
            saved={async () => {
              setEditor(null);
              await refresh("保存しました");
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {toast && (
          <motion.div
            className="fixed bottom-[30px] left-1/2 z-100 flex -translate-x-1/2 items-center gap-2 rounded-[13px] border border-line bg-panel px-4 py-[11px] text-[11px] shadow-[0_24px_70px_#4c392718] dark:shadow-[0_28px_80px_#100d0966] [&_svg]:w-[15px] [&_svg]:text-accent"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            <Check />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PanelTitle({
  title,
  text,
  action,
  actionText,
}: {
  title: string;
  text: string;
  action?: () => void;
  actionText?: string;
}) {
  return (
    <div className="mb-5 flex items-end justify-between max-md:items-center">
      <div>
        <h2 className="mb-[5px] text-xl tracking-[-0.025em]">{title}</h2>
        <p className="text-[11px] text-muted max-md:max-w-[220px]">{text}</p>
      </div>
      {action && (
        <button
          className="inline-flex h-[39px] cursor-pointer items-center justify-center gap-[7px] rounded-xl border-0 bg-accent px-[15px] text-[11px] font-bold text-white shadow-[0_8px_20px_color-mix(in_srgb,var(--accent)_25%,transparent)] hover:-translate-y-px [&_svg]:w-[15px]"
          onClick={action}
        >
          <Plus />
          {actionText}
        </button>
      )}
    </div>
  );
}
function SettingsCard({
  icon,
  title,
  text,
  badge,
  edit,
  remove,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  badge?: string;
  edit: () => void;
  remove: () => void;
}) {
  return (
    <motion.article
      className="grid min-h-[170px] grid-cols-[40px_1fr] gap-[13px] rounded-[19px] border border-line bg-[color-mix(in_srgb,var(--panel)_82%,transparent)] p-[19px] shadow-[0_8px_30px_#302d3a0a]"
      whileHover={{ y: -3 }}
    >
      <span className="grid size-10 place-items-center rounded-[13px] bg-[color-mix(in_srgb,var(--accent)_11%,var(--panel))] text-accent [&_svg]:w-[18px]">
        {icon}
      </span>
      <div>
        <div className="flex items-center gap-2">
          <h3 className="mt-0.5 mb-[5px] text-sm">{title}</h3>
          {badge && (
            <small className="rounded-[5px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-1.5 py-0.5 text-[8px] text-accent">
              {badge}
            </small>
          )}
        </div>
        <p className="line-clamp-2 h-[38px] text-[10px] leading-[1.55] text-muted">{text}</p>
      </div>
      <div className="col-span-full flex self-end justify-end gap-1 border-t border-line pt-[11px] [&_button]:flex [&_button]:h-[31px] [&_button]:cursor-pointer [&_button]:items-center [&_button]:gap-[5px] [&_button]:rounded-[9px] [&_button]:border-0 [&_button]:bg-transparent [&_button]:px-[9px] [&_button]:text-[10px] [&_button]:text-muted [&_button:hover]:bg-panel-2 [&_button:hover]:text-text [&_svg]:w-3.5">
        <button onClick={edit}>
          <MoreHorizontal />
          編集
        </button>
        <button className="hover:text-[#de6b76]!" onClick={remove}>
          <Trash2 />
        </button>
      </div>
    </motion.article>
  );
}

function Editor({
  editor,
  close,
  saved,
}: {
  editor: { type: "project" | "skill"; item?: Project | Skill };
  close: () => void;
  saved: () => Promise<void>;
}) {
  const isSkill = editor.type === "skill",
    item = editor.item;
  const skill = isSkill ? (item as Skill | undefined) : undefined;
  const project = !isSkill ? (item as Project | undefined) : undefined;
  const [name, setName] = useState(item?.name || "");
  const [description, setDescription] = useState(skill?.description || "");
  const [instructions, setInstructions] = useState(
    skill?.instructions || project?.system_prompt || "",
  );
  const [icon, setIcon] = useState(project?.icon || "folder");
  const [color, setColor] = useState(project?.color || "clay");
  const [enabled, setEnabled] = useState(skill?.enabled !== 0);
  const [saving, setSaving] = useState(false);
  const labelClass = "grid gap-[7px] text-[10px] font-bold text-muted";
  const controlClass =
    "w-full rounded-[11px] border border-line bg-bg px-[11px] py-2.5 text-xs leading-[1.55] text-text outline-none focus:border-accent";
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const path = `/api/${isSkill ? "skills" : "projects"}${item ? `/${item.id}` : ""}`;
    await api(path, {
      method: item ? "PUT" : "POST",
      body: JSON.stringify(
        isSkill
          ? { name, description, instructions, enabled }
          : { name, systemPrompt: instructions, icon, color },
      ),
    });
    await saved();
  }
  return (
    <Modal
      title={`${isSkill ? "スキル" : "プロジェクト"}${item ? "を編集" : "を作成"}`}
      close={close}
    >
      <form className="grid gap-[15px] p-5" onSubmit={submit}>
        <label className={labelClass}>
          名前
          <input
            className={controlClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            required
            autoFocus
          />
        </label>
        {!isSkill && (
          <fieldset className="grid gap-[7px] border-0 p-0 [&_legend]:p-0 [&_legend]:text-[10px] [&_legend]:font-bold [&_legend]:text-muted">
            <legend>アイコン</legend>
            <div className="mb-[5px] flex gap-[7px]">
              {Object.entries(projectIcons).map(([value, Icon]) => (
                <button
                  key={value}
                  type="button"
                  className={`grid size-[34px] cursor-pointer place-items-center rounded-[10px] border bg-bg [&_svg]:w-4 ${icon === value ? "border-accent shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_18%,transparent)]" : "border-line"}`}
                  onClick={() => setIcon(value)}
                  aria-label={value}
                >
                  <Icon />
                </button>
              ))}
            </div>
            <legend>色</legend>
            <div className="mb-[5px] flex gap-[7px]">
              {projectColors.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`size-[34px] cursor-pointer rounded-[10px] border bg-[var(--project-color)] ${projectColorClasses[value]} ${color === value ? "border-accent shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_18%,transparent)]" : "border-line"}`}
                  onClick={() => setColor(value)}
                  aria-label={value}
                />
              ))}
            </div>
          </fieldset>
        )}
        {isSkill && (
          <label className={labelClass}>
            説明
            <input
              className={controlClass}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              placeholder="いつ使うスキルか"
            />
          </label>
        )}
        <label className={labelClass}>
          {isSkill ? "スキル指示" : "システムプロンプト"}
          <textarea
            className={`${controlClass} resize-y max-md:min-h-[180px]`}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            rows={11}
            maxLength={30000}
            placeholder={
              isSkill ? "AIが従う具体的な手順やルール" : "このプロジェクトでの人格、役割、回答方針"
            }
            required={isSkill}
          />
        </label>
        {isSkill && (
          <label className="flex items-center justify-between text-[10px] font-bold text-muted">
            <span>このスキルを有効にする</span>
            <input
              className="relative h-[22px] w-[38px] cursor-pointer appearance-none rounded-[20px] border-0 bg-panel-2 p-0 after:absolute after:top-[3px] after:left-[3px] after:size-4 after:rounded-full after:bg-muted after:content-[''] after:transition-[left] checked:bg-accent checked:after:left-[19px] checked:after:bg-white"
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
          </label>
        )}
        <footer className="flex justify-end gap-2 pt-[7px]">
          <button
            className="h-[39px] cursor-pointer border-0 bg-transparent text-[11px] text-muted"
            type="button"
            onClick={close}
          >
            キャンセル
          </button>
          <button
            className="inline-flex h-[39px] cursor-pointer items-center justify-center rounded-xl border-0 bg-accent px-[15px] text-[11px] font-bold text-white shadow-[0_8px_20px_color-mix(in_srgb,var(--accent)_25%,transparent)] disabled:opacity-50"
            disabled={saving}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

export default function App() {
  const theme = useTheme();
  const [data, setData] = useState<Bootstrap | null>(null);
  const [path, setPath] = useState(location.pathname);
  const settings = path.startsWith("/settings/");
  const login = path === "/login";
  useEffect(() => {
    const update = () => setPath(location.pathname);
    addEventListener("popstate", update);
    return () => removeEventListener("popstate", update);
  }, []);
  useEffect(() => {
    if (!login) void getBootstrap().then(setData);
  }, [settings, login]);
  if (login) return <Login />;
  if (!data)
    return (
      <div className="grid h-svh place-items-center">
        <motion.div
          className="size-2 rounded-full bg-accent"
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ repeat: Infinity, duration: 1.2 }}
        />
      </div>
    );
  return path.startsWith("/settings/") ? (
    <SettingsPage initial={data} theme={theme} />
  ) : (
    <Chat initial={data} />
  );
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
