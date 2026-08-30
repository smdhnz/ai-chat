"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, File, LogOut, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, getBootstrap, type Project, type Skill, type ThinkingLevel } from "@/lib/api";
import { useBootstrap } from "@/hooks/use-bootstrap";
import {
  formatSize,
  settingsTabFromPath,
  settingsTabLabels,
  settingsTabs,
} from "@/app/settings/_libs/settings";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LoadingScreen } from "@/components/loading-screen";
import { ProjectIcon } from "@/components/project-icon";
import { Editor } from "@/app/settings/_components/settings-editor";
import { ThemeToggle } from "@/app/settings/_components/theme-toggle";

type DeleteTarget = { type: "projects" | "skills" | "data"; id: string; name: string };

const settingFieldClass = "flex min-h-[70px] items-center justify-between gap-5 py-[15px]";
const settingLabelClass = "text-[10px] font-bold text-foreground";
const settingControlClass =
  "h-[38px] w-[55%] rounded-[11px] border border-border bg-background px-[11px] text-foreground shadow-none focus-visible:border-ring focus-visible:ring-0";

export function SettingsShell() {
  const pathname = usePathname();
  const tab = settingsTabFromPath(pathname);
  const [data, setData] = useBootstrap();
  const [language, setLanguage] = useState("");
  const [ctrlEnterSend, setCtrlEnterSend] = useState(false);
  const [model, setModel] = useState("");
  const [thinking, setThinking] = useState<ThinkingLevel>("low");
  const [editor, setEditor] = useState<{
    type: "project" | "skill";
    item?: Project | Skill;
  } | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const settingsSaveTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const settingsSaveRevision = useRef(0);
  const loaded = useRef(false);

  useEffect(() => {
    if (!data || loaded.current) return;
    loaded.current = true;
    setLanguage(data.user.language);
    setCtrlEnterSend(data.user.ctrl_enter_send === 1);
    setModel(data.user.model);
    setThinking(data.user.thinking_level);
  }, [data]);

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
    const path = type === "data" ? "/api/data" : `/api/${type}/${objectId}`;
    await api(path, { method: "DELETE" });
    await refresh("削除しました");
  }

  function openEditor(next: { type: "project" | "skill"; item?: Project | Skill }) {
    setEditor(next);
    setEditorOpen(true);
  }

  function askDelete(next: DeleteTarget) {
    setDeleteTarget(next);
    setDeleteOpen(true);
  }

  if (!data) return <LoadingScreen />;

  return (
    <div className="min-h-svh">
      <main className="mx-auto w-[calc(100%-26px)] pt-5 pb-20">
        <header className="mb-[30px] flex items-center">
          <Link
            href="/"
            className="inline-flex size-10 items-center justify-center rounded-[13px] border border-border bg-card text-muted-foreground transition duration-200 hover:text-foreground [&_svg]:size-[18px]"
            aria-label="チャットに戻る"
          >
            <ArrowLeft />
          </Link>
        </header>
        <div>
          <nav
            className="mb-7 flex w-full overflow-x-auto rounded-[15px] border border-border bg-card p-1.5"
            aria-label="設定"
          >
            {settingsTabs.map((item) => (
              <Link
                key={item}
                href={`/settings/${item}`}
                aria-current={item === tab ? "page" : undefined}
                className={`inline-flex h-[35px] flex-1 items-center justify-center rounded-[10px] px-[13px] text-[11px] font-semibold transition duration-200 ${item === tab ? "bg-card text-foreground shadow-[0_4px_14px_#27243112]" : "text-muted-foreground"}`}
              >
                {settingsTabLabels[item]}
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
                    action={() => openEditor({ type: "project" })}
                    actionText="作成"
                  />
                  {data.projects.length > 0 && (
                    <div className="grid grid-cols-1 gap-3">
                      {data.projects.map((item) => (
                        <SettingsCard
                          key={item.id}
                          icon={<ProjectIcon project={item} />}
                          title={item.name}
                          text={item.system_prompt || "カスタム指示なし"}
                          edit={() => openEditor({ type: "project", item })}
                          remove={() =>
                            askDelete({ type: "projects", id: item.id, name: item.name })
                          }
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
              {tab === "skills" && (
                <>
                  <PanelTitle
                    title="スキル"
                    text="有効なスキルはすべての会話と画像プロンプトに適用されます。"
                    action={() => openEditor({ type: "skill" })}
                    actionText="追加"
                  />
                  {data.skills.length > 0 && (
                    <div className="grid grid-cols-1 gap-3">
                      {data.skills.map((item) => (
                        <SettingsCard
                          key={item.id}
                          icon={<Sparkles />}
                          title={item.name}
                          text={item.description || item.instructions}
                          badge={item.enabled ? "有効" : "無効"}
                          edit={() => openEditor({ type: "skill", item })}
                          remove={() => askDelete({ type: "skills", id: item.id, name: item.name })}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
              {tab === "files" && (
                <>
                  <PanelTitle title="ファイル" text="アップロードしたファイルと生成画像です。" />
                  {data.files.length > 0 && (
                    <div className="grid grid-cols-2 gap-3">
                      {data.files.map((file) => (
                        <a
                          href={`/files/${file.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-0 overflow-hidden rounded-[17px] border border-border bg-card"
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
                              <span className="flex size-full items-center justify-center bg-muted [&_svg]:w-[35px] [&_svg]:text-muted-foreground">
                                <File />
                              </span>
                            )}
                          </span>
                          <span className="block min-w-0 px-[11px] py-2.5">
                            <strong className="block w-full truncate text-[10px]">
                              {file.name}
                            </strong>
                            <span className="mt-[3px] block truncate text-[8px] text-muted-foreground">
                              {file.source === "generated" ? "生成画像" : "アップロード"} ·{" "}
                              {formatSize(file.size)}
                            </span>
                          </span>
                        </a>
                      ))}
                    </div>
                  )}
                </>
              )}
              {tab === "general" && (
                <>
                  <PanelTitle title="一般" text="回答とアカウントの設定です。" />
                  <div>
                    <div className={settingFieldClass}>
                      <span className={settingLabelClass}>テーマ</span>
                      <ThemeToggle />
                    </div>
                    <div className="border-t border-border" />
                    <label className={settingFieldClass} htmlFor="response-language">
                      <span className={settingLabelClass}>回答言語</span>
                      <input
                        className={settingControlClass}
                        id="response-language"
                        type="text"
                        value={language}
                        onChange={(event) => {
                          setLanguage(event.target.value);
                          autoSaveSettings(event.target.value, ctrlEnterSend, model, thinking);
                        }}
                        maxLength={80}
                        placeholder="Japanese"
                      />
                    </label>
                    <div className="border-t border-border" />
                    <label className={settingFieldClass} htmlFor="response-model">
                      <span className={settingLabelClass}>モデル</span>
                      <select
                        id="response-model"
                        className={settingControlClass}
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
                    </label>
                    <div className="border-t border-border" />
                    <label className={settingFieldClass} htmlFor="response-thinking">
                      <span className={settingLabelClass}>Thinking</span>
                      <select
                        id="response-thinking"
                        className={settingControlClass}
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
                    </label>
                  </div>
                  <div className="border-t border-border" />
                  <div className="flex flex-wrap items-start gap-[15px] py-[18px]">
                    <span className="flex size-[54px] shrink-0 items-center justify-center overflow-hidden rounded-[17px] bg-muted font-bold">
                      {data.user.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="size-full object-cover" src={data.user.avatar} alt="" />
                      ) : (
                        data.user.display_name[0]
                      )}
                    </span>
                    <div className="flex-1">
                      <h2 className="mb-1 text-base">{data.user.display_name}</h2>
                      <p className="text-[11px] text-muted-foreground">@{data.user.username}</p>
                    </div>
                    <form className="w-full" method="post" action="/logout">
                      <button className="inline-flex h-[38px] w-full items-center justify-center gap-[7px] rounded-[11px] border border-[color-mix(in_srgb,#de6b76_28%,var(--border))] bg-transparent px-3 text-[10px] text-destructive [&_svg]:size-3.5">
                        <LogOut />
                        ログアウト
                      </button>
                    </form>
                  </div>
                  <div className="border-t border-border" />
                  <section className="flex flex-col items-stretch gap-2 py-[18px]">
                    <div className="flex-1">
                      <h2 className="mb-[3px] text-[13px]">データ削除</h2>
                      <p className="text-[9px] text-muted-foreground">この操作は取り消せません。</p>
                    </div>
                    <button
                      type="button"
                      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[10px] border border-[color-mix(in_srgb,#de6b76_30%,var(--border))] bg-transparent px-2.5 text-[9px] text-destructive [&_svg]:size-[13px]"
                      onClick={() => askDelete({ type: "data", id: "", name: "すべてのデータ" })}
                    >
                      <Trash2 />
                      データを削除
                    </button>
                  </section>
                </>
              )}
            </motion.section>
          </AnimatePresence>
        </div>
      </main>

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

      {editor && (
        <Editor
          key={`${editor.type}-${editor.item?.id ?? "new"}`}
          editor={editor}
          open={editorOpen}
          onOpenChange={setEditorOpen}
          saved={async () => {
            setEditorOpen(false);
            await refresh("保存しました");
          }}
        />
      )}
    </div>
  );
}

export function PanelTitle({
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
    <div className="mb-5 flex items-center justify-between">
      <div>
        <h2 className="mb-[5px] text-xl tracking-[-0.025em]">{title}</h2>
        <p className="max-w-[220px] text-[11px] text-muted-foreground">{text}</p>
      </div>
      {action && (
        <button
          type="button"
          className="inline-flex h-[39px] items-center gap-[7px] rounded-xl bg-primary px-[15px] text-[11px] font-bold text-primary-foreground shadow-[0_8px_20px_color-mix(in_srgb,var(--primary)_25%,transparent)] [&_svg]:size-[15px]"
          onClick={action}
        >
          <Plus />
          {actionText}
        </button>
      )}
    </div>
  );
}

export function SettingsCard({
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
    <article className="flex h-full min-h-[120px] items-start gap-3 rounded-[17px] border border-border bg-[color-mix(in_srgb,var(--card)_82%,transparent)] p-[15px] shadow-[0_8px_30px_#302d3a0a]">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--primary)_11%,var(--card))] text-primary [&_svg]:w-4">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="mb-1 flex items-center gap-2 text-[13px] font-semibold">
          <span className="truncate">{title}</span>
          {badge && (
            <span className="rounded-[5px] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] px-1.5 py-0.5 text-[8px] font-normal text-primary">
              {badge}
            </span>
          )}
        </h3>
        <p className="line-clamp-2 text-[9px] leading-[1.5] text-muted-foreground">{text}</p>
      </div>
      <div className="flex gap-0.5">
        <button
          type="button"
          className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground [&_svg]:size-4"
          aria-label={`${title}を編集`}
          onClick={edit}
        >
          <Pencil />
        </button>
        <button
          type="button"
          className="inline-flex size-8 items-center justify-center rounded-lg text-destructive [&_svg]:size-4"
          aria-label={`${title}を削除`}
          onClick={remove}
        >
          <Trash2 />
        </button>
      </div>
    </article>
  );
}
