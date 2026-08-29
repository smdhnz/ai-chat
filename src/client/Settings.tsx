import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  Check,
  File,
  LogOut,
  MoreHorizontal,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  api,
  getBootstrap,
  type Bootstrap,
  type Project,
  type Skill,
  type ThinkingLevel,
} from "./api";
import {
  projectColorClasses,
  projectIcons,
  projectColors,
  settingsTabFromPath,
  useTheme,
  formatSize,
} from "./lib";
import { ProjectIcon, Link, ThemeButton, Modal, ConfirmDialog } from "./ui";

export function SettingsPage({
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
            className="flex size-10 items-center justify-center rounded-[13px] border border-line bg-panel text-muted transition duration-200 hover:-translate-x-0.5 hover:text-text [&_svg]:w-[18px]"
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
                <div className="flex flex-wrap gap-3 [&>*]:basis-[calc(50%-6px)] [&>*]:grow max-md:[&>*]:basis-full">
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
                <div className="flex flex-wrap gap-3 [&>*]:basis-[calc(50%-6px)] [&>*]:grow max-md:[&>*]:basis-full">
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
                <div className="flex flex-wrap gap-3 [&>*]:basis-[calc(25%-9px)] [&>*]:grow max-md:[&>*]:basis-[calc(50%-6px)]">
                  {data.files.map((file) => (
                    <a
                      className="min-w-0 overflow-hidden rounded-[17px] border border-line bg-panel transition duration-200 hover:-translate-y-[3px] hover:shadow-[0_24px_70px_#4c392718] dark:hover:shadow-[0_28px_80px_#100d0966]"
                      href={`/files/${file.id}`}
                      target="_blank"
                      key={file.id}
                    >
                      {file.mime.startsWith("image/") ? (
                        <img
                          className="block aspect-4/3 w-full object-cover"
                          src={`/files/${file.id}`}
                          alt={file.name}
                          loading="lazy"
                        />
                      ) : (
                        <span className="flex aspect-4/3 w-full items-center justify-center bg-panel-2 [&_svg]:w-[35px] [&_svg]:text-muted">
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
                    <span className="flex! flex-col gap-0.5">
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
                    <span className="flex size-[54px] items-center justify-center rounded-[17px] bg-panel-2 font-bold">
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
    <motion.article
      className="flex min-h-[170px] gap-[13px] rounded-[19px] border border-line bg-[color-mix(in_srgb,var(--panel)_82%,transparent)] p-[19px] shadow-[0_8px_30px_#302d3a0a]"
      whileHover={{ y: -3 }}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-[color-mix(in_srgb,var(--accent)_11%,var(--panel))] text-accent [&_svg]:w-[18px]">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
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

export function Editor({
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
  const labelClass = "flex flex-col gap-[7px] text-[10px] font-bold text-muted";
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
      <form className="flex flex-col gap-[15px] p-5" onSubmit={submit}>
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
          <fieldset className="flex flex-col gap-[7px] border-0 p-0 [&_legend]:p-0 [&_legend]:text-[10px] [&_legend]:font-bold [&_legend]:text-muted">
            <legend>アイコン</legend>
            <div className="mb-[5px] flex gap-[7px]">
              {Object.entries(projectIcons).map(([value, Icon]) => (
                <button
                  key={value}
                  type="button"
                  className={`flex size-[34px] cursor-pointer items-center justify-center rounded-[10px] border bg-bg [&_svg]:w-4 ${icon === value ? "border-accent shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_18%,transparent)]" : "border-line"}`}
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
