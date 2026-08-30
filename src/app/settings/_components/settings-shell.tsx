"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  File,
  Files,
  FolderKanban,
  LogOut,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  api,
  getBootstrap,
  type Bootstrap,
  type Project,
  type Skill,
  type ThinkingLevel,
} from "@/lib/api";
import { formatSize, settingsTabLabels, type SettingsTab } from "@/app/settings/_libs/settings";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { NativeDialog } from "@/components/native-dialog";
import { ProjectIcon } from "@/components/project-icon";
import { Editor } from "@/app/settings/_components/settings-editor";

type DeleteTarget = { type: "projects" | "skills" | "data"; id: string; name: string };
type EditorState = { type: "project" | "skill"; item?: Project | Skill };

const settingFieldClass = "flex min-h-[58px] items-center justify-between gap-5 px-4";
const settingLabelClass = "text-[13px] text-foreground";
const settingControlClass =
  "h-[36px] w-[55%] border-0 bg-transparent px-0 text-right text-[13px] text-muted-foreground outline-none focus-visible:text-foreground";
const pageHeaderClass =
  "relative flex h-[58px] shrink-0 items-center justify-center border-b border-border px-3";

export function SettingsShell({
  open,
  onOpenChange,
  data,
  setData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: Bootstrap;
  setData: (data: Bootstrap) => void;
}) {
  const reduceMotion = useReducedMotion();
  const [tab, setTab] = useState<SettingsTab | null>(null);
  const [direction, setDirection] = useState(1);
  const [closing, setClosing] = useState(false);
  const [language, setLanguage] = useState("");
  const [ctrlEnterSend, setCtrlEnterSend] = useState(false);
  const [model, setModel] = useState("");
  const [thinking, setThinking] = useState<ThinkingLevel>("low");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const settingsSaveTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const settingsSaveRevision = useRef(0);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    setLanguage(data.user.language);
    setCtrlEnterSend(data.user.ctrl_enter_send === 1);
    setModel(data.user.model);
    setThinking(data.user.thinking_level);
  }, [data]);

  useEffect(() => {
    setClosing(false);
    if (open) return;
    setTab(null);
    setEditor(null);
  }, [open]);

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
          toast.success("自動保存しました");
        })
        .catch((error: Error) => {
          if (revision === settingsSaveRevision.current)
            toast.error(`保存できませんでした: ${error.message}`);
        });
    }, 500);
  }

  async function refresh(message?: string) {
    setData(await getBootstrap());
    if (message) toast.success(message);
  }

  async function remove(type: DeleteTarget["type"], objectId: string) {
    await api(type === "data" ? "/api/data" : `/api/${type}/${objectId}`, {
      method: "DELETE",
    });
    await refresh("削除しました");
  }

  function close() {
    if (!closing) setClosing(true);
  }

  function showTab(next: SettingsTab) {
    setDirection(1);
    setTab(next);
  }

  function showEditor(next: EditorState) {
    setDirection(1);
    setEditor(next);
  }

  function back() {
    setDirection(-1);
    if (editor) setEditor(null);
    else setTab(null);
  }

  const viewKey = editor
    ? `${editor.type}-${editor.item?.id ?? "new"}`
    : tab
      ? `tab-${tab}`
      : "root";
  const title = editor
    ? `${editor.type === "skill" ? "スキル" : "プロジェクト"}${editor.item ? "を編集" : "を作成"}`
    : tab
      ? settingsTabLabels[tab]
      : "設定";
  const visible = open && !closing;

  return (
    <>
      <NativeDialog
        open={open}
        onClose={close}
        label="設定"
        className="fixed inset-0 size-full overflow-hidden"
        focusDialog
      >
        <motion.div
          initial={false}
          animate={{
            backgroundColor: visible ? "rgb(0 0 0 / 0.45)" : "rgb(0 0 0 / 0)",
          }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
          className="flex size-full items-end"
          onClick={(event) => event.target === event.currentTarget && close()}
        >
          <motion.section
            initial={{ y: "100%" }}
            animate={{ y: visible ? 0 : "100%" }}
            transition={{ duration: reduceMotion ? 0 : 0.38, ease: [0.32, 0.72, 0, 1] }}
            onAnimationComplete={() => {
              if (!closing) return;
              onOpenChange(false);
            }}
            className="flex h-[96svh] max-h-[96svh] w-full flex-col overflow-hidden rounded-t-[28px] border-t border-border bg-background shadow-[0_-20px_60px_rgba(0,0,0,0.35)]"
          >
            <div className="flex h-5 shrink-0 items-center justify-center" aria-hidden="true">
              <span className="h-1 w-9 rounded-full bg-muted-foreground/35" />
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <AnimatePresence initial={false} mode="popLayout">
                <motion.div
                  key={viewKey}
                  initial={{ x: direction > 0 ? "100%" : "-28%", opacity: 0.7 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: direction > 0 ? "-28%" : "100%", opacity: 0.7 }}
                  transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.32, 0.72, 0, 1] }}
                  className="absolute inset-0 flex flex-col bg-background"
                >
                  <header className={pageHeaderClass}>
                    {tab && (
                      <button
                        type="button"
                        className="absolute left-2 inline-flex h-10 items-center gap-0.5 px-1 text-[13px] text-primary [&_svg]:size-5"
                        onClick={back}
                        aria-label="前の画面に戻る"
                      >
                        <ChevronLeft />
                        戻る
                      </button>
                    )}
                    <h2 className="text-[16px] font-bold">{title}</h2>
                    {!tab && (
                      <button
                        type="button"
                        className="absolute right-3 inline-flex size-9 items-center justify-center rounded-full bg-muted [&_svg]:size-[18px]"
                        onClick={close}
                        aria-label="設定を閉じる"
                      >
                        <X />
                      </button>
                    )}
                  </header>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                    {editor ? (
                      <Editor
                        key={viewKey}
                        editor={editor}
                        cancel={back}
                        saved={async () => {
                          await refresh("保存しました");
                          back();
                        }}
                      />
                    ) : tab ? (
                      <SettingsDetail
                        tab={tab}
                        data={data}
                        language={language}
                        model={model}
                        thinking={thinking}
                        saveLanguage={(value) => {
                          setLanguage(value);
                          autoSaveSettings(value, ctrlEnterSend, model, thinking);
                        }}
                        saveModel={(value) => {
                          setModel(value);
                          autoSaveSettings(language, ctrlEnterSend, value, thinking);
                        }}
                        saveThinking={(value) => {
                          setThinking(value);
                          autoSaveSettings(language, ctrlEnterSend, model, value);
                        }}
                        edit={showEditor}
                        askDelete={(next) => {
                          setDeleteTarget(next);
                          setDeleteOpen(true);
                        }}
                      />
                    ) : (
                      <SettingsHome data={data} showTab={showTab} />
                    )}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.section>
        </motion.div>
      </NativeDialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={
          {
            projects: "プロジェクトを削除",
            skills: "スキルを削除",
            data: "データを削除",
          }[deleteTarget?.type ?? "data"]
        }
        text={
          {
            projects: `「${deleteTarget?.name ?? ""}」と中のチャット・ファイルを削除します。`,
            skills: `「${deleteTarget?.name ?? ""}」を削除します。`,
            data: "すべてのプロジェクト・チャット・ファイルを削除します。スキルとアカウント設定は残ります。",
          }[deleteTarget?.type ?? "data"]
        }
        onConfirm={async () => {
          if (deleteTarget) await remove(deleteTarget.type, deleteTarget.id);
        }}
      />
    </>
  );
}

function SettingsHome({ data, showTab }: { data: Bootstrap; showTab: (tab: SettingsTab) => void }) {
  return (
    <div className="flex flex-col gap-6 px-4 pt-5 pb-[max(28px,env(safe-area-inset-bottom))]">
      <section className="flex items-center gap-3 rounded-[14px] bg-card p-3.5">
        <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-bold">
          {data.user.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="size-full object-cover" src={data.user.avatar} alt="" />
          ) : (
            data.user.display_name[0]
          )}
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold">{data.user.display_name}</h3>
          <p className="truncate text-[11px] text-muted-foreground">@{data.user.username}</p>
        </div>
      </section>
      <section className="overflow-hidden rounded-[14px] bg-card">
        <SettingsLink icon={Bot} label="一般" onClick={() => showTab("general")} />
        <SettingsLink
          icon={FolderKanban}
          label="プロジェクト"
          value={`${data.projects.length}`}
          onClick={() => showTab("projects")}
        />
        <SettingsLink
          icon={Sparkles}
          label="スキル"
          value={`${data.skills.length}`}
          onClick={() => showTab("skills")}
        />
        <SettingsLink
          icon={Files}
          label="ファイル"
          value={`${data.files.length}`}
          onClick={() => showTab("files")}
        />
      </section>
    </div>
  );
}

function SettingsLink({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex min-h-[54px] w-full items-center gap-3 border-b border-border px-3.5 text-left last:border-b-0"
      onClick={onClick}
    >
      <span className="flex size-8 items-center justify-center rounded-[8px] bg-primary text-primary-foreground [&_svg]:size-[17px]">
        <Icon />
      </span>
      <span className="flex-1 text-[14px]">{label}</span>
      {value && <span className="text-[13px] text-muted-foreground">{value}</span>}
      <ChevronRight className="size-[17px] text-muted-foreground/60" />
    </button>
  );
}

function SettingsDetail({
  tab,
  data,
  language,
  model,
  thinking,
  saveLanguage,
  saveModel,
  saveThinking,
  edit,
  askDelete,
}: {
  tab: SettingsTab;
  data: Bootstrap;
  language: string;
  model: string;
  thinking: ThinkingLevel;
  saveLanguage: (value: string) => void;
  saveModel: (value: string) => void;
  saveThinking: (value: ThinkingLevel) => void;
  edit: (editor: EditorState) => void;
  askDelete: (target: DeleteTarget) => void;
}) {
  if (tab === "projects")
    return (
      <DetailLayout
        text="会話ごとのシステムプロンプトを設定します。"
        action="作成"
        onAction={() => edit({ type: "project" })}
      >
        {data.projects.length ? (
          <section className="overflow-hidden rounded-[14px] bg-card">
            {data.projects.map((item) => (
              <SettingsCard
                key={item.id}
                icon={<ProjectIcon project={item} />}
                title={item.name}
                text={item.system_prompt || "カスタム指示なし"}
                edit={() => edit({ type: "project", item })}
                remove={() => askDelete({ type: "projects", id: item.id, name: item.name })}
              />
            ))}
          </section>
        ) : (
          <EmptyText>プロジェクトはありません。</EmptyText>
        )}
      </DetailLayout>
    );

  if (tab === "skills")
    return (
      <DetailLayout
        text="有効なスキルはすべての会話と画像プロンプトに適用されます。"
        action="追加"
        onAction={() => edit({ type: "skill" })}
      >
        {data.skills.length ? (
          <section className="overflow-hidden rounded-[14px] bg-card">
            {data.skills.map((item) => (
              <SettingsCard
                key={item.id}
                icon={<Sparkles />}
                title={item.name}
                text={item.description || item.instructions}
                badge={item.enabled ? "有効" : "無効"}
                edit={() => edit({ type: "skill", item })}
                remove={() => askDelete({ type: "skills", id: item.id, name: item.name })}
              />
            ))}
          </section>
        ) : (
          <EmptyText>スキルはありません。</EmptyText>
        )}
      </DetailLayout>
    );

  if (tab === "files")
    return (
      <DetailLayout text="アップロードしたファイルと生成画像です。">
        {data.files.length ? (
          <div className="grid grid-cols-2 gap-3">
            {data.files.map((file) => (
              <a
                href={`/files/${file.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 overflow-hidden rounded-[14px] bg-card"
                key={file.id}
              >
                <span className="block aspect-[4/3] w-full">
                  {file.mime.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="size-full object-cover"
                      src={`/files/${file.id}`}
                      alt={file.name}
                      loading="lazy"
                    />
                  ) : (
                    <span className="flex size-full items-center justify-center bg-muted [&_svg]:size-8 [&_svg]:text-muted-foreground">
                      <File />
                    </span>
                  )}
                </span>
                <span className="block min-w-0 px-3 py-2.5">
                  <strong className="block truncate text-[11px]">{file.name}</strong>
                  <span className="mt-1 block truncate text-[9px] text-muted-foreground">
                    {file.source === "generated" ? "生成画像" : "アップロード"} ·{" "}
                    {formatSize(file.size)}
                  </span>
                </span>
              </a>
            ))}
          </div>
        ) : (
          <EmptyText>ファイルはありません。</EmptyText>
        )}
      </DetailLayout>
    );

  return (
    <div className="flex flex-col gap-6 px-4 pt-5 pb-[max(28px,env(safe-area-inset-bottom))]">
      <section>
        <p className="mb-2 px-1 text-[11px] text-muted-foreground">回答</p>
        <div className="overflow-hidden rounded-[14px] bg-card">
          <label className={settingFieldClass} htmlFor="response-language">
            <span className={settingLabelClass}>回答言語</span>
            <input
              className={settingControlClass}
              id="response-language"
              type="text"
              value={language}
              onChange={(event) => saveLanguage(event.target.value)}
              maxLength={80}
              placeholder="Japanese"
            />
          </label>
          <div className="ml-4 border-t border-border" />
          <label className={settingFieldClass} htmlFor="response-model">
            <span className={settingLabelClass}>モデル</span>
            <select
              id="response-model"
              className={settingControlClass}
              value={model}
              onChange={(event) => saveModel(event.target.value)}
            >
              {data.models.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <div className="ml-4 border-t border-border" />
          <label className={settingFieldClass} htmlFor="response-thinking">
            <span className={settingLabelClass}>Thinking</span>
            <select
              id="response-thinking"
              className={settingControlClass}
              value={thinking}
              onChange={(event) => saveThinking(event.target.value as ThinkingLevel)}
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
        </div>
      </section>
      <section>
        <p className="mb-2 px-1 text-[11px] text-muted-foreground">アカウント</p>
        <div className="overflow-hidden rounded-[14px] bg-card">
          <div className="flex items-center gap-3 p-4">
            <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-bold">
              {data.user.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="size-full object-cover" src={data.user.avatar} alt="" />
              ) : (
                data.user.display_name[0]
              )}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[14px] font-semibold">{data.user.display_name}</h3>
              <p className="truncate text-[10px] text-muted-foreground">@{data.user.username}</p>
            </div>
          </div>
          <div className="ml-4 border-t border-border" />
          <form method="post" action="/logout">
            <button className="flex min-h-[52px] w-full items-center justify-center gap-2 text-[13px] text-destructive [&_svg]:size-4">
              <LogOut />
              ログアウト
            </button>
          </form>
        </div>
      </section>
      <section>
        <p className="mb-2 px-1 text-[11px] text-muted-foreground">データ</p>
        <button
          type="button"
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-card text-[13px] text-destructive [&_svg]:size-4"
          onClick={() => askDelete({ type: "data", id: "", name: "すべてのデータ" })}
        >
          <Trash2 />
          すべてのデータを削除
        </button>
      </section>
    </div>
  );
}

function DetailLayout({
  text,
  action,
  onAction,
  children,
}: {
  text: string;
  action?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="px-4 pt-5 pb-[max(28px,env(safe-area-inset-bottom))]">
      <div className="mb-4 flex min-h-10 items-center gap-3 px-1">
        <p className="flex-1 text-[11px] leading-relaxed text-muted-foreground">{text}</p>
        {onAction && (
          <button
            type="button"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] bg-primary px-3 text-[11px] font-bold text-primary-foreground [&_svg]:size-4"
            onClick={onAction}
          >
            <Plus />
            {action}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function EmptyText({ children }: { children: ReactNode }) {
  return <p className="py-12 text-center text-[12px] text-muted-foreground">{children}</p>;
}

function SettingsCard({
  icon,
  title,
  text,
  badge,
  edit,
  remove,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  badge?: string;
  edit: () => void;
  remove: () => void;
}) {
  return (
    <article className="flex min-h-[78px] items-center gap-3 border-b border-border p-3.5 last:border-b-0">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-[color-mix(in_srgb,var(--primary)_14%,var(--card))] text-primary [&_svg]:size-4">
        {icon}
      </span>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={edit}>
        <span className="flex items-center gap-2">
          <strong className="truncate text-[13px] font-semibold">{title}</strong>
          {badge && <span className="text-[9px] text-primary">{badge}</span>}
        </span>
        <span className="mt-1 block truncate text-[10px] text-muted-foreground">{text}</span>
      </button>
      <button
        type="button"
        className="inline-flex size-8 items-center justify-center text-muted-foreground [&_svg]:size-4"
        aria-label={`${title}を編集`}
        onClick={edit}
      >
        <Pencil />
      </button>
      <button
        type="button"
        className="inline-flex size-8 items-center justify-center text-destructive [&_svg]:size-4"
        aria-label={`${title}を削除`}
        onClick={remove}
      >
        <Trash2 />
      </button>
    </article>
  );
}
