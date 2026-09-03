"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
  type PanInfo,
} from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Images,
  LogOut,
  Mail,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  MessageSquareText,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  api,
  getBootstrap,
  type Bootstrap,
  type FileItem,
  type Project,
  type ProjectInvitation,
  type Skill,
} from "@/lib/api";
import { settingsTabLabels, type SettingsTab } from "@/app/settings/_libs/settings";
import { canStartSwipe, shouldCompleteSwipe } from "@/lib/swipe";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ImageDialog } from "@/components/image-dialog";
import { NativeDialog } from "@/components/native-dialog";
import { Editor, SkillEditor, SkillManager } from "@/app/settings/_components/settings-editor";

type DeleteTarget = { type: "projects" | "skills" | "data"; id: string; name: string };
type EditorState =
  { type: "project"; item?: Project } | { type: "skill"; item: Skill; projectId?: string };

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
  const sheetDragControls = useDragControls();
  const backDragControls = useDragControls();
  const [tab, setTab] = useState<SettingsTab | null>(null);
  const [direction, setDirection] = useState(1);
  const [closing, setClosing] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    setClosing(false);
    if (open) return;
    setTab(null);
    setEditor(null);
  }, [open]);

  async function refresh(message?: string) {
    const fresh = await getBootstrap();
    setData(fresh);
    if (message) toast.success(message);
    return fresh;
  }

  async function remove(type: DeleteTarget["type"], objectId: string) {
    await api(type === "data" ? "/api/data" : `/api/${type}/${objectId}`, {
      method: "DELETE",
    });
    await refresh("削除しました");
    if (type === "skills") setEditor(null);
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
    if (editor?.type === "skill" && editor.projectId) {
      setEditor({
        type: "project",
        item: data.projects.find((project) => project.id === editor.projectId),
      });
    } else if (editor) setEditor(null);
    else if (tab === "skills") setTab("chat");
    else setTab(null);
  }

  const viewKey = editor
    ? `${editor.type}-${editor.item?.id ?? "new"}`
    : tab
      ? `tab-${tab}`
      : "root";
  const title = editor
    ? editor.type === "project"
      ? `プロジェクト${editor.item ? (editor.item.is_owner ? "を編集" : "の詳細") : "を作成"}`
      : "スキルを編集"
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
            drag="y"
            dragControls={sheetDragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 1 }}
            onPointerDownCapture={(event) => {
              const top = event.currentTarget.getBoundingClientRect().top;
              if (event.clientY - top <= 78) sheetDragControls.start(event);
            }}
            onDragEnd={(_, info: PanInfo) => {
              if (shouldCompleteSwipe(info.offset.y, window.innerHeight * 0.18, info.velocity.y))
                close();
            }}
            onAnimationComplete={() => {
              if (!closing) return;
              onOpenChange(false);
            }}
            className="flex h-[96svh] max-h-[96svh] w-full flex-col overflow-hidden rounded-t-[28px] border-t border-border bg-background shadow-[0_-20px_60px_rgba(0,0,0,0.35)]"
          >
            <div
              className="flex h-5 shrink-0 touch-none cursor-grab items-center justify-center active:cursor-grabbing"
              aria-hidden="true"
            >
              <span className="h-1 w-9 rounded-full bg-muted-foreground/35" />
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <AnimatePresence initial={false}>
                <motion.div
                  key={viewKey}
                  initial={{ x: direction > 0 ? "100%" : "-28%" }}
                  animate={{ x: 0 }}
                  exit={{ x: direction > 0 ? "-28%" : "100%" }}
                  transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.32, 0.72, 0, 1] }}
                  drag={tab ? "x" : false}
                  dragControls={backDragControls}
                  dragListener={false}
                  onPointerDownCapture={(event) => {
                    if (tab && canStartSwipe(false, event.clientX, window.innerWidth))
                      backDragControls.start(event);
                  }}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={{ left: 0, right: 1 }}
                  onDragEnd={(_, info: PanInfo) => {
                    if (
                      tab &&
                      shouldCompleteSwipe(info.offset.x, window.innerWidth * 0.2, info.velocity.x)
                    )
                      back();
                  }}
                  className="absolute inset-0 flex touch-pan-y flex-col bg-background"
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
                      editor.type === "project" ? (
                        <Editor
                          key={viewKey}
                          item={editor.item}
                          users={data.users}
                          cancel={back}
                          refresh={async () => {
                            const fresh = await refresh();
                            return editor.item
                              ? (fresh.projects.find((project) => project.id === editor.item?.id) ??
                                  null)
                              : null;
                          }}
                          saved={async () => {
                            await refresh("保存しました");
                            back();
                          }}
                          editSkill={(skill) =>
                            showEditor({ type: "skill", item: skill, projectId: editor.item?.id })
                          }
                          removeSkill={(skill) => {
                            setDeleteTarget({ type: "skills", id: skill.id, name: skill.name });
                            setDeleteOpen(true);
                          }}
                        />
                      ) : (
                        <SkillEditor
                          key={viewKey}
                          item={editor.item}
                          cancel={back}
                          remove={() => {
                            if (!editor.item.editable) return;
                            setDeleteTarget({
                              type: "skills",
                              id: editor.item.id,
                              name: editor.item.name,
                            });
                            setDeleteOpen(true);
                          }}
                          saved={async () => {
                            const fresh = await refresh("保存しました");
                            if (editor.projectId)
                              setEditor({
                                type: "project",
                                item: fresh.projects.find(
                                  (project) => project.id === editor.projectId,
                                ),
                              });
                            else back();
                          }}
                        />
                      )
                    ) : tab ? (
                      <SettingsDetail
                        tab={tab}
                        data={data}
                        edit={showEditor}
                        navigate={showTab}
                        refresh={refresh}
                        askDelete={(next) => {
                          setDeleteTarget(next);
                          setDeleteOpen(true);
                        }}
                      />
                    ) : (
                      <SettingsHome
                        data={data}
                        showTab={showTab}
                        deleteData={() => {
                          setDeleteTarget({ type: "data", id: "", name: "すべてのデータ" });
                          setDeleteOpen(true);
                        }}
                      />
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
            projects: `「${deleteTarget?.name ?? ""}」と中のチャット・画像を削除します。`,
            skills: `「${deleteTarget?.name ?? ""}」を削除します。`,
            data: "個人プロジェクト・個人チャット・画像を削除します。共有プロジェクトのデータと所属は残ります。",
          }[deleteTarget?.type ?? "data"]
        }
        onConfirm={async () => {
          if (deleteTarget) await remove(deleteTarget.type, deleteTarget.id);
        }}
      />
    </>
  );
}

function SettingsHome({
  data,
  showTab,
  deleteData,
}: {
  data: Bootstrap;
  showTab: (tab: SettingsTab) => void;
  deleteData: () => void;
}) {
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
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold">{data.user.display_name}</h3>
          <p className="truncate text-[11px] text-muted-foreground">@{data.user.username}</p>
        </div>
        <form className="shrink-0" method="post" action="/logout">
          <button
            type="submit"
            className="inline-flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-[18px]"
            aria-label="ログアウト"
          >
            <LogOut />
          </button>
        </form>
      </section>
      <section className="overflow-hidden rounded-[14px] bg-card">
        <SettingsLink icon={MessageSquareText} label="一般" onClick={() => showTab("chat")} />
        <SettingsLink
          icon={FolderKanban}
          label="プロジェクト"
          value={`${data.projects.length}`}
          onClick={() => showTab("projects")}
        />
        <SettingsLink
          icon={Mail}
          label="プロジェクト招待"
          value={`${data.invitations.length}`}
          onClick={() => showTab("invitations")}
        />
        <SettingsLink
          icon={Images}
          label="画像"
          value={`${data.files.length}`}
          onClick={() => showTab("files")}
        />
      </section>
      <button
        type="button"
        className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-card text-[13px] text-destructive [&_svg]:size-4"
        onClick={deleteData}
      >
        <Trash2 />
        すべてのデータを削除
      </button>
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
      <span className="flex size-8 items-center justify-center text-primary [&_svg]:size-[17px]">
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
  edit,
  refresh,
  askDelete,
  navigate,
}: {
  tab: SettingsTab;
  data: Bootstrap;
  edit: (editor: EditorState) => void;
  refresh: (message?: string) => Promise<Bootstrap>;
  askDelete: (target: DeleteTarget) => void;
  navigate: (tab: SettingsTab) => void;
}) {
  if (tab === "chat")
    return (
      <>
        <StandardChatSettings
          value={data.user.default_system_prompt}
          saved={() => refresh("保存しました")}
        />
        <div className="px-4 pb-[max(28px,env(safe-area-inset-bottom))]">
          <section className="overflow-hidden rounded-[14px] bg-card">
            <SettingsLink
              icon={Sparkles}
              label="スキル"
              value={`${data.skills.filter((skill) => skill.source !== "builtin").length}`}
              onClick={() => navigate("skills")}
            />
          </section>
        </div>
      </>
    );

  if (tab === "skills")
    return (
      <DetailLayout text="プロジェクトを使用しない通常・一時チャットに適用されます。">
        <SkillManager
          skills={data.skills}
          edit={(item) => edit({ type: "skill", item })}
          remove={(item) => askDelete({ type: "skills", id: item.id, name: item.name })}
          refresh={async () => {
            await refresh();
          }}
        />
      </DetailLayout>
    );

  if (tab === "projects")
    return (
      <DetailLayout
        text="共有メンバーとAIの指示を管理します。"
        action="作成"
        onAction={() => edit({ type: "project" })}
      >
        {data.projects.length ? (
          <section className="overflow-hidden rounded-[14px] bg-card">
            {data.projects.map((item) => (
              <SettingsCard
                key={item.id}
                title={item.name}
                text={item.system_prompt || "システムプロンプトなし"}
                badge={item.is_owner ? (item.shared ? "共有中" : "オーナー") : "参加中"}
                edit={() => edit({ type: "project", item })}
                remove={
                  item.is_owner
                    ? () => askDelete({ type: "projects", id: item.id, name: item.name })
                    : undefined
                }
              />
            ))}
          </section>
        ) : (
          <EmptyText>プロジェクトはありません。</EmptyText>
        )}
      </DetailLayout>
    );

  if (tab === "invitations")
    return (
      <ProjectInvitations
        invitations={data.invitations}
        decide={async (projectId, decision) => {
          await api(`/api/invitations/${projectId}/${decision}`, { method: "POST" });
          await refresh(decision === "accept" ? "参加しました" : "招待を拒否しました");
        }}
      />
    );

  return <SettingsImages files={data.files} />;
}

function StandardChatSettings({
  value,
  saved,
}: {
  value: string;
  saved: () => Promise<Bootstrap>;
}) {
  const [prompt, setPrompt] = useState(value);
  const [saving, setSaving] = useState(false);

  return (
    <DetailLayout text="プロジェクトを使用しない通常・一時チャットに適用されます。">
      <form
        className="flex flex-col gap-4 rounded-[14px] bg-card p-3.5"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          try {
            await api("/api/settings", {
              method: "PUT",
              body: JSON.stringify({ defaultSystemPrompt: prompt }),
            });
            await saved();
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "保存できませんでした");
          } finally {
            setSaving(false);
          }
        }}
      >
        <label className="flex flex-col gap-2" htmlFor="default-system-prompt">
          <span className="text-[12px] font-semibold">システムプロンプト</span>
          <textarea
            id="default-system-prompt"
            className="min-h-[240px] resize-y rounded-[12px] border border-input bg-background px-3 py-2.5 text-base leading-relaxed outline-none focus:border-ring"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            maxLength={30000}
            rows={14}
          />
        </label>
        <button
          type="submit"
          className="inline-flex h-11 items-center justify-center self-end rounded-full bg-[linear-gradient(150deg,#c99bc5,#9f7ab8)] px-6 text-xs font-bold text-primary-foreground disabled:opacity-50"
          disabled={saving}
        >
          {saving ? "保存中" : "保存"}
        </button>
      </form>
    </DetailLayout>
  );
}

function ProjectInvitations({
  invitations,
  decide,
}: {
  invitations: ProjectInvitation[];
  decide: (projectId: string, decision: "accept" | "decline") => Promise<void>;
}) {
  const [processing, setProcessing] = useState("");
  return (
    <DetailLayout text="プロジェクトへの招待を承認または拒否します。">
      {invitations.length ? (
        <section className="overflow-hidden rounded-[14px] bg-card">
          {invitations.map((invitation) => (
            <article
              key={invitation.project_id}
              className="flex min-h-[72px] items-center gap-3 border-b border-border px-3.5 last:border-b-0"
            >
              <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-bold">
                {invitation.owner.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="size-full object-cover" src={invitation.owner.avatar} alt="" />
                ) : (
                  invitation.owner.display_name[0]
                )}
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-[13px]">{invitation.project_name}</strong>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {invitation.owner.display_name}からの招待
                </span>
              </span>
              <button
                type="button"
                className="h-8 px-2 text-[10px] text-muted-foreground"
                disabled={Boolean(processing)}
                onClick={async () => {
                  setProcessing(invitation.project_id);
                  try {
                    await decide(invitation.project_id, "decline");
                  } finally {
                    setProcessing("");
                  }
                }}
              >
                拒否
              </button>
              <button
                type="button"
                className="h-8 rounded-[9px] bg-primary px-3 text-[10px] font-bold text-primary-foreground disabled:opacity-50"
                disabled={Boolean(processing)}
                onClick={async () => {
                  setProcessing(invitation.project_id);
                  try {
                    await decide(invitation.project_id, "accept");
                  } finally {
                    setProcessing("");
                  }
                }}
              >
                承認
              </button>
            </article>
          ))}
        </section>
      ) : (
        <EmptyText>プロジェクト招待はありません。</EmptyText>
      )}
    </DetailLayout>
  );
}

function SettingsThumbnail({ file }: { file: FileItem }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="size-full object-cover" src={`/files/${file.id}?preview`} alt="" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={`absolute inset-0 size-full object-cover transition-all duration-300 motion-reduce:transition-none ${loaded ? "opacity-100 active:scale-[0.97]" : "opacity-0"}`}
        src={`/files/${file.id}`}
        alt=""
        loading="lazy"
        onLoad={() => setLoaded(true)}
      />
    </>
  );
}

function SettingsImages({ files }: { files: FileItem[] }) {
  const [preview, setPreview] = useState<FileItem | null>(null);

  return (
    <>
      <DetailLayout text="アップロード・生成した画像です。">
        {files.length ? (
          <div className="grid grid-cols-2 gap-3">
            {files.map((file) => (
              <button
                type="button"
                className="relative aspect-[4/3] min-w-0 cursor-zoom-in overflow-hidden rounded-[14px] bg-card p-0 shadow-[0_12px_30px_rgba(0,0,0,0.16)]"
                key={file.id}
                aria-label={`${file.name}を表示`}
                onClick={() => setPreview(file)}
              >
                <SettingsThumbnail file={file} />
              </button>
            ))}
          </div>
        ) : (
          <EmptyText>画像はありません。</EmptyText>
        )}
      </DetailLayout>
      <ImageDialog
        open={Boolean(preview)}
        onOpenChange={(open) => !open && setPreview(null)}
        src={preview ? `/files/${preview.id}` : ""}
        name={preview?.name ?? "image"}
      />
    </>
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
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] bg-[linear-gradient(150deg,#c99bc5,#9f7ab8)] px-3 text-[11px] font-bold text-primary-foreground [&_svg]:size-4"
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
  title,
  text,
  badge,
  edit,
  remove,
  control,
  showAction = true,
}: {
  title: string;
  text: string;
  badge?: string;
  edit: () => void;
  remove?: () => void;
  control?: ReactNode;
  showAction?: boolean;
}) {
  return (
    <article className="flex min-h-[78px] items-center gap-3 border-b border-border p-3.5 last:border-b-0">
      <button type="button" className="min-w-0 flex-1 text-left" onClick={edit}>
        <span className="flex items-center gap-2">
          <strong className="truncate text-[13px] font-semibold">{title}</strong>
          {badge && <span className="text-[9px] text-primary">{badge}</span>}
        </span>
        <span className="mt-1 block truncate text-[10px] text-muted-foreground">{text}</span>
      </button>
      {control}
      {showAction ? (
        <button
          type="button"
          className="inline-flex size-8 items-center justify-center text-muted-foreground [&_svg]:size-4"
          aria-label={`${title}を編集`}
          onClick={edit}
        >
          <Pencil />
        </button>
      ) : null}
      {remove ? (
        <button
          type="button"
          className="inline-flex size-8 items-center justify-center text-destructive [&_svg]:size-4"
          aria-label={`${title}を削除`}
          onClick={remove}
        >
          <Trash2 />
        </button>
      ) : null}
    </article>
  );
}
