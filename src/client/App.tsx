import {
  useEffect,
  useId,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ComponentProps,
  type FormEvent,
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
const ease = [0.22, 1, 0.36, 1] as const;
const projectIcons = {
  folder: Folder,
  briefcase: Briefcase,
  code: Code2,
  book: BookOpen,
  palette: Palette,
  rocket: Rocket,
};
const projectColors = ["clay", "blue", "green", "purple", "gold", "rose"] as const;

function ProjectIcon({ project }: { project?: Project }) {
  const Icon = projectIcons[project?.icon as keyof typeof projectIcons] || Folder;
  return (
    <span className={`project-icon project-${project?.color || "clay"}`}>
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
    <button className="icon-button" onClick={toggle} aria-label={label} title={label}>
      {dark ? <Sun /> : <Moon />}
    </button>
  );
}

function Login() {
  const error = new URLSearchParams(location.search).get("error");
  return (
    <main className="login-screen">
      <motion.section
        className="login-card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease }}
      >
        <h1>Chat</h1>
        <a className="discord-button" href="/api/auth/discord">
          Discordでログイン
        </a>
        {error && (
          <p className="error-text">
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
  select,
  remove,
}: {
  item: Conversation;
  active: boolean;
  select: () => void;
  remove: () => void;
}) {
  return (
    <div className={`conversation-item ${active ? "active" : ""}`}>
      <button onClick={select}>
        <MessageSquare />
        <span>{item.title}</span>
        {item.unread === 1 && !active && <i className="unread-dot" aria-label="新しい応答" />}
      </button>
      <button
        className="sidebar-delete"
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
  const shellRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const autoScrollRef = useRef(true);

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
    const refresh = async () => {
      const fresh = await getBootstrap();
      if (!active) return;
      setData(fresh);
      const id = conversationFromPath();
      const conversation = fresh.conversations.find((item) => item.id === id);
      if (id && conversation?.generation_status !== "running") {
        const current = await api<Message[]>(`/api/conversations/${id}`);
        if (active && conversationFromPath() === id) setMessages(current);
      }
    };
    const timer = setInterval(() => void refresh().catch(() => undefined), 2_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    const media = matchMedia("(max-width: 767px)");
    const update = () => setMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    const shell = shellRef.current;
    if (!mobile || !viewport || !shell) return;
    const update = () => {
      shell.style.height = `${viewport.height}px`;
      shell.style.top = `${viewport.offsetTop}px`;
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      shell.style.removeProperty("height");
      shell.style.removeProperty("top");
    };
  }, [mobile]);
  useEffect(() => {
    const navigate = () => {
      const id = conversationFromPath();
      const conversation = data.conversations.find((item) => item.id === id);
      setConversationId(conversation?.id || null);
      setProjectId(conversation?.project_id || "");
      setTemporary(temporaryFromUrl());
    };
    addEventListener("popstate", navigate);
    return () => removeEventListener("popstate", navigate);
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

  useEffect(() => {
    if (!conversationId || !generating) return;
    const streamId = `stream-${conversationId}`;
    const source = new EventSource(`/api/conversations/${conversationId}/stream`);
    source.onmessage = (event) => {
      const update = JSON.parse(event.data) as { content?: string; done?: boolean };
      if (update.done) {
        source.close();
        void Promise.all([
          getBootstrap(),
          api<Message[]>(`/api/conversations/${conversationId}`),
        ]).then(([fresh, current]) => {
          setData(fresh);
          setMessages(current);
        });
        return;
      }
      if (!update.content) return;
      setMessages((value) => {
        const message: Message = {
          id: streamId,
          role: "assistant",
          content: update.content ?? "",
          files: [],
          created_at: new Date().toISOString(),
        };
        const index = value.findIndex((item) => item.id === streamId);
        return index < 0
          ? [...value, message]
          : value.map((item) => (item.id === streamId ? message : item));
      });
    };
    return () => source.close();
  }, [conversationId, generating]);

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

  return (
    <div ref={shellRef} className={`app-shell ${sidebar ? "" : "sidebar-closed"}`}>
      <AnimatePresence>
        {sidebar && (
          <motion.button
            className="scrim md:hidden"
            aria-label="メニューを閉じる"
            onClick={() => setMobileSidebar(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>
      <aside className={`sidebar ${sidebar ? "open" : ""}`}>
        <button className="new-chat" onClick={() => newChat()}>
          <Plus />
          新しいチャット
        </button>
        <nav className="conversation-list">
          {data.projects.map((group) => (
            <details key={group.id}>
              <summary>
                <ChevronRight />
                <ProjectIcon project={group} />
                <span>{group.name}</span>
                <button
                  type="button"
                  className="project-new-chat"
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
                  className="project-delete"
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
        <Link className="profile-link" href="/settings/projects">
          {data.user.avatar ? (
            <img src={data.user.avatar} alt="" />
          ) : (
            <span className="avatar">{data.user.display_name[0]}</span>
          )}
          <span>
            <strong>{data.user.display_name}</strong>
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

      <main className="chat-main">
        <header className="topbar">
          <button
            className="icon-button"
            onClick={() => setSidebar(!sidebar)}
            aria-label={sidebar ? "サイドバーを閉じる" : "サイドバーを開く"}
          >
            <Menu />
          </button>
          <button
            className="icon-button mobile-new-chat"
            onClick={() => newChat()}
            aria-label="新しいチャット"
            title="新しいチャット"
          >
            <Plus />
          </button>
          {project && (
            <div className="project-label">
              <ProjectIcon project={project} />
              <span>{project.name}</span>
            </div>
          )}
          <button
            className={`icon-button temporary-chat ${temporary ? "active" : ""}`}
            onClick={toggleTemporary}
            aria-label={temporary ? "一時チャットを終了" : "一時チャットを開始"}
            title="一時チャット"
          >
            <TimerReset />
          </button>
        </header>
        <section
          ref={scrollRef}
          className="message-scroll"
          onScroll={(event) => {
            const element = event.currentTarget;
            autoScrollRef.current =
              element.scrollHeight - element.scrollTop - element.clientHeight < 120;
          }}
        >
          {messages.length > 0 && (
            <div className="message-column">
              {visibleMessages.length < messages.length && (
                <button
                  className="load-older"
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
  const collapsible = message.role === "user" && content.length > 1200;
  const [expanded, setExpanded] = useState(false);
  return (
    <motion.article
      className={`message ${message.role}`}
      initial={{ opacity: 0, y: 14, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.38, ease }}
    >
      <div className="message-stack">
        {message.role === "user" && message.files?.length > 0 && (
          <FileBlocks files={message.files} />
        )}
        {hasBody && (
          <>
            <div className={`message-body ${collapsible && !expanded ? "collapsed" : ""}`}>
              {message.skills && message.skills.length > 0 && (
                <div className="used-skills">
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
                className="expand-message"
                aria-expanded={expanded}
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? "一部表示に戻す" : "全文を表示"}
              </button>
            )}
          </>
        )}
        {message.role === "assistant" && message.files?.length > 0 && (
          <FileBlocks files={message.files} />
        )}
        {message.role === "user" && (
          <div className="message-actions">
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
    <div className="code-block">
      <button
        type="button"
        aria-label="コードをコピー"
        title="コードをコピー"
        onClick={() => copy.copy(code.current?.innerText ?? "")}
      >
        {copy.copied ? <Check /> : <Copy />}
      </button>
      <pre ref={code} {...props}>
        {children}
      </pre>
    </div>
  );
}

function AuthCard({ auth }: { auth: DeviceAuth }) {
  const copy = useCopy();
  return (
    <div className="auth-card">
      <div>
        <span className="pulse-dot" />
        <strong>Codexの再認証が必要です</strong>
      </div>
      <a href={auth.verificationUri} target="_blank" rel="noopener noreferrer">
        認証ページを新しいタブで開く ↗
      </a>
      <button
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

function FileBlocks({ files }: { files: FileItem[] }) {
  const [preview, setPreview] = useState<FileItem | null>(null);
  const previewUrl = preview?.preview || (preview?.id ? `/files/${preview.id}` : "");
  return (
    <>
      <div className="message-files">
        {files.map((file) =>
          file.mime.startsWith("image/") && (file.id || file.preview) ? (
            <button
              key={file.id || file.name}
              className="image-thumb"
              onClick={() => setPreview(file)}
              aria-label={`${file.name}を拡大表示`}
            >
              <img src={file.preview || `/files/${file.id}`} alt={file.name} />
            </button>
          ) : (
            <a
              key={file.id || file.name}
              className="file-chip"
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
            className="image-lightbox"
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
  return (
    <motion.div className="message assistant" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="thinking">
        <i />
        <i />
        <i />
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
    <footer className="composer-area">
      <form className={`composer ${props.temporary ? "temporary" : ""}`} onSubmit={props.send}>
        {props.temporary && (
          <span className="temporary-label">
            <TimerReset />
            一時チャット
          </span>
        )}
        {props.editing && (
          <div className="editing-label">
            <Pencil />
            選択したメッセージを編集中
            <button type="button" onClick={props.cancelEditing}>
              キャンセル
            </button>
          </div>
        )}
        {props.files.length > 0 && (
          <div className="attachment-row">
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
        <textarea
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
        <div className="composer-tools">
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
              className="tool"
              onClick={() => input.current?.click()}
              aria-label="ファイルを添付"
              title="ファイルを添付"
            >
              <Paperclip />
            </button>
          )}
          <span className="grow" />
          {props.generating ? (
            <button
              type="button"
              className="send-button stop-button"
              onClick={() => void props.stop()}
              aria-label="生成を停止"
              title="生成を停止"
            >
              <Square />
            </button>
          ) : (
            <button
              className="send-button"
              disabled={!props.prompt.trim() && !props.files.length}
              aria-label={props.editing ? "編集して再生成" : "送信"}
            >
              <ArrowUp />
            </button>
          )}
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
      className="modal-backdrop"
      onMouseDown={close}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.3, ease }}
      >
        <header>
          <strong id={titleId}>{title}</strong>
          <button className="icon-button" onClick={close}>
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
      <div className="confirm-dialog">
        <p>{text}</p>
        {error && <p className="error-text">{error}</p>}
        <div>
          <button onClick={close} disabled={deleting}>
            キャンセル
          </button>
          <button
            className="danger-button"
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
  return (
    <div className="settings-page">
      <div className="aurora" />
      <main className="settings-shell">
        <header className="settings-header">
          <Link href="/" className="back-link" aria-label="チャットに戻る" title="チャットに戻る">
            <ArrowLeft />
          </Link>
          <h1>設定</h1>
        </header>
        <nav className="settings-tabs">
          {(["projects", "skills", "files", "general"] as const).map((item) => (
            <Link className={tab === item ? "active" : ""} href={`/settings/${item}`} key={item}>
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
            className="settings-panel"
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
                <div className="card-grid">
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
                <div className="card-grid">
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
                <div className="file-grid">
                  {data.files.map((file) => (
                    <a href={`/files/${file.id}`} target="_blank" key={file.id}>
                      {file.mime.startsWith("image/") ? (
                        <img src={`/files/${file.id}`} alt={file.name} loading="lazy" />
                      ) : (
                        <span className="file-placeholder">
                          <File />
                        </span>
                      )}
                      <div>
                        <strong>{file.name}</strong>
                        <small>
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
                <div className="language-settings">
                  <div className="general-setting-row">
                    <span>テーマ</span>
                    <ThemeButton {...theme} />
                  </div>
                  <div className="general-setting-row">
                    <span>回答言語</span>
                    <input
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
                  <div className="general-setting-row">
                    <span>モデル</span>
                    <select
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
                          {item.name} ({item.id})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="general-setting-row">
                    <span>Thinking</span>
                    <select
                      id="thinking-level"
                      aria-label="Thinking"
                      value={thinking}
                      onChange={(event) => {
                        const value = event.target.value as ThinkingLevel;
                        setThinking(value);
                        autoSaveSettings(language, ctrlEnterSend, model, value);
                      }}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                  <div className="general-setting-row send-shortcut">
                    <span>
                      Ctrl + Enterで送信
                      <small>PCのみ。スマートフォンではEnterで改行します。</small>
                    </span>
                    <input
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
                <div className="account-card">
                  {data.user.avatar ? (
                    <img src={data.user.avatar} alt="" />
                  ) : (
                    <span className="avatar large">{data.user.display_name[0]}</span>
                  )}
                  <div>
                    <h2>{data.user.display_name}</h2>
                    <p>@{data.user.username}</p>
                  </div>
                  <form method="post" action="/logout">
                    <button>
                      <LogOut />
                      ログアウト
                    </button>
                  </form>
                </div>
                <section className="danger-zone">
                  <div>
                    <h2>データ削除</h2>
                    <p>この操作は取り消せません。</p>
                  </div>
                  <button
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
            className="toast"
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
    <div className="panel-title">
      <div>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
      {action && (
        <button className="primary-button" onClick={action}>
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
    <motion.article className="settings-card" whileHover={{ y: -3 }}>
      <span className="card-icon">{icon}</span>
      <div>
        <div className="card-title">
          <h3>{title}</h3>
          {badge && <small>{badge}</small>}
        </div>
        <p>{text}</p>
      </div>
      <div className="card-actions">
        <button onClick={edit}>
          <MoreHorizontal />
          編集
        </button>
        <button className="delete" onClick={remove}>
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
      <form className="editor-form" onSubmit={submit}>
        <label>
          名前
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            required
            autoFocus
          />
        </label>
        {!isSkill && (
          <fieldset className="project-appearance">
            <legend>アイコン</legend>
            <div>
              {Object.entries(projectIcons).map(([value, Icon]) => (
                <button
                  key={value}
                  type="button"
                  className={icon === value ? "selected" : ""}
                  onClick={() => setIcon(value)}
                  aria-label={value}
                >
                  <Icon />
                </button>
              ))}
            </div>
            <legend>色</legend>
            <div>
              {projectColors.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`color-choice project-${value} ${color === value ? "selected" : ""}`}
                  onClick={() => setColor(value)}
                  aria-label={value}
                />
              ))}
            </div>
          </fieldset>
        )}
        {isSkill && (
          <label>
            説明
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              placeholder="いつ使うスキルか"
            />
          </label>
        )}
        <label>
          {isSkill ? "スキル指示" : "システムプロンプト"}
          <textarea
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
          <label className="switch">
            <span>このスキルを有効にする</span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
          </label>
        )}
        <footer>
          <button type="button" onClick={close}>
            キャンセル
          </button>
          <button className="primary-button" disabled={saving}>
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
      <div className="loading-screen">
        <motion.div
          className="loading-dot"
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
