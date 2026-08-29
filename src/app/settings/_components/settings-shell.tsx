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
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type DeleteTarget = { type: "projects" | "skills" | "data"; id: string; name: string };

const settingFieldClass = "min-h-[70px] items-center gap-5 py-[15px]";
const settingLabelClass = "text-[10px] font-bold text-foreground";
const settingControlClass =
  "h-[38px] w-[min(320px,55%)] rounded-[11px] border-border bg-background px-[11px] text-foreground shadow-none focus-visible:border-ring focus-visible:ring-0 max-md:w-[55%]";

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
    <div className="relative min-h-svh">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_0,#c15f3c12,transparent_38%)]" />
      <main className="relative z-1 mx-auto w-[min(1060px,calc(100%-40px))] pt-9 pb-20 max-md:w-[calc(100%-26px)] max-md:pt-5">
        <header className="mb-[30px] flex items-center">
          <Button
            asChild
            variant="outline"
            size="icon-lg"
            className="size-10 rounded-[13px] border-border bg-card text-muted-foreground transition duration-200 hover:text-foreground [&_svg:not([class*='size-'])]:size-[18px]"
            aria-label="チャットに戻る"
          >
            <Link href="/">
              <ArrowLeft />
            </Link>
          </Button>
        </header>
        <Tabs value={tab} className="gap-0">
          <div className="mb-[38px] w-max rounded-[15px] border border-border bg-[color-mix(in_srgb,var(--card)_65%,transparent)] p-1.5 backdrop-blur-[18px] max-md:mb-7 max-md:w-full max-md:overflow-x-auto">
            <TabsList className="h-auto w-max gap-1 bg-transparent p-0 max-md:w-full max-md:justify-start">
              {settingsTabs.map((item) => (
                <TabsTrigger
                  key={item}
                  value={item}
                  asChild
                  className="h-[35px] rounded-[10px] border-0 px-[17px] text-[11px] font-semibold text-muted-foreground transition duration-200 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-[0_4px_14px_#27243112] max-md:flex-1 max-md:justify-center max-md:px-[13px]"
                >
                  <Link href={`/settings/${item}`}>{settingsTabLabels[item]}</Link>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value={tab}>
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
                      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
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
                      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
                        {data.skills.map((item) => (
                          <SettingsCard
                            key={item.id}
                            icon={<Sparkles />}
                            title={item.name}
                            text={item.description || item.instructions}
                            badge={item.enabled ? "有効" : "無効"}
                            edit={() => openEditor({ type: "skill", item })}
                            remove={() =>
                              askDelete({ type: "skills", id: item.id, name: item.name })
                            }
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
                      <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
                        {data.files.map((file) => (
                          <Item
                            asChild
                            variant="outline"
                            className="min-w-0 flex-col items-stretch gap-0 overflow-hidden rounded-[17px] border-border bg-card p-0 shadow-none hover:bg-card"
                            key={file.id}
                          >
                            <a href={`/files/${file.id}`} target="_blank">
                              <ItemMedia className="w-full self-stretch">
                                <AspectRatio ratio={4 / 3}>
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
                                </AspectRatio>
                              </ItemMedia>
                              <ItemContent className="gap-0 px-[11px] py-2.5">
                                <ItemTitle className="block w-full truncate text-[10px] font-bold">
                                  {file.name}
                                </ItemTitle>
                                <ItemDescription className="mt-[3px] line-clamp-1 text-[8px]">
                                  {file.source === "generated" ? "生成画像" : "アップロード"} ·{" "}
                                  {formatSize(file.size)}
                                </ItemDescription>
                              </ItemContent>
                            </a>
                          </Item>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {tab === "general" && (
                  <>
                    <PanelTitle title="一般" text="回答とアカウントの設定です。" />
                    <FieldGroup className="gap-0">
                      <Field orientation="horizontal" className={settingFieldClass}>
                        <FieldTitle className={settingLabelClass}>テーマ</FieldTitle>
                        <ThemeToggle />
                      </Field>
                      <Separator />
                      <Field orientation="horizontal" className={settingFieldClass}>
                        <FieldLabel className={settingLabelClass} htmlFor="response-language">
                          回答言語
                        </FieldLabel>
                        <Input
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
                      </Field>
                      <Separator />
                      <Field orientation="horizontal" className={settingFieldClass}>
                        <FieldLabel className={settingLabelClass} htmlFor="response-model">
                          モデル
                        </FieldLabel>
                        <Select
                          value={model}
                          onValueChange={(value) => {
                            setModel(value);
                            autoSaveSettings(language, ctrlEnterSend, value, thinking);
                          }}
                        >
                          <SelectTrigger
                            id="response-model"
                            className={settingControlClass}
                            aria-label="モデル"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {data.models.map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Separator />
                      <Field orientation="horizontal" className={settingFieldClass}>
                        <FieldLabel className={settingLabelClass} htmlFor="response-thinking">
                          Thinking
                        </FieldLabel>
                        <Select
                          value={thinking}
                          onValueChange={(value) => {
                            setThinking(value as ThinkingLevel);
                            autoSaveSettings(
                              language,
                              ctrlEnterSend,
                              model,
                              value as ThinkingLevel,
                            );
                          }}
                        >
                          <SelectTrigger
                            id="response-thinking"
                            className={settingControlClass}
                            aria-label="Thinking"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Separator />
                      <Field
                        orientation="horizontal"
                        className={`${settingFieldClass} items-center!`}
                      >
                        <FieldContent className="gap-0.5">
                          <FieldLabel
                            className={`${settingLabelClass} gap-1`}
                            htmlFor="ctrl-enter-send"
                          >
                            <KbdGroup>
                              <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd>
                            </KbdGroup>
                            で送信
                          </FieldLabel>
                          <FieldDescription className="text-[8px]">
                            PCのみ。スマートフォンではEnterで改行します。
                          </FieldDescription>
                        </FieldContent>
                        <Switch
                          id="ctrl-enter-send"
                          size="lg"
                          checked={ctrlEnterSend}
                          onCheckedChange={(checked) => {
                            setCtrlEnterSend(checked);
                            autoSaveSettings(language, checked, model, thinking);
                          }}
                        />
                      </Field>
                    </FieldGroup>
                    <Separator />
                    <div className="flex items-center gap-[15px] py-[18px] max-md:flex-wrap max-md:items-start">
                      <Avatar className="size-[54px] rounded-[17px]">
                        {data.user.avatar && <AvatarImage src={data.user.avatar} alt="" />}
                        <AvatarFallback className="rounded-[17px] bg-muted font-bold">
                          {data.user.display_name[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <h2 className="mb-1 text-base">{data.user.display_name}</h2>
                        <p className="text-[11px] text-muted-foreground">@{data.user.username}</p>
                      </div>
                      <form className="max-md:w-full" method="post" action="/logout">
                        <Button
                          variant="outline"
                          className="h-[38px] gap-[7px] rounded-[11px] border-[color-mix(in_srgb,#de6b76_28%,var(--border))] bg-transparent px-3 text-[10px] text-destructive hover:text-destructive max-md:w-full max-md:justify-center [&_svg:not([class*='size-'])]:size-3.5"
                        >
                          <LogOut />
                          ログアウト
                        </Button>
                      </form>
                    </div>
                    <Separator />
                    <section className="flex items-center gap-2 py-[18px] max-md:flex-col max-md:items-stretch">
                      <div className="flex-1">
                        <h2 className="mb-[3px] text-[13px]">データ削除</h2>
                        <p className="text-[9px] text-muted-foreground">
                          この操作は取り消せません。
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        className="min-h-9 gap-1.5 rounded-[10px] border-[color-mix(in_srgb,#de6b76_30%,var(--border))] bg-transparent px-2.5 text-[9px] text-destructive hover:text-destructive max-md:justify-center [&_svg:not([class*='size-'])]:size-[13px]"
                        onClick={() => askDelete({ type: "data", id: "", name: "すべてのデータ" })}
                      >
                        <Trash2 />
                        データを削除
                      </Button>
                    </section>
                  </>
                )}
              </motion.section>
            </AnimatePresence>
          </TabsContent>
        </Tabs>
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
    <div className="mb-5 flex items-end justify-between max-md:items-center">
      <div>
        <h2 className="mb-[5px] text-xl tracking-[-0.025em]">{title}</h2>
        <p className="text-[11px] text-muted-foreground max-md:max-w-[220px]">{text}</p>
      </div>
      {action && (
        <Button
          className="h-[39px] gap-[7px] rounded-xl px-[15px] text-[11px] font-bold shadow-[0_8px_20px_color-mix(in_srgb,var(--primary)_25%,transparent)] hover:-translate-y-px [&_svg:not([class*='size-'])]:size-[15px]"
          onClick={action}
        >
          <Plus />
          {actionText}
        </Button>
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
    <Item
      variant="outline"
      className="h-full min-h-[120px] flex-nowrap items-start gap-3 rounded-[17px] border-border bg-[color-mix(in_srgb,var(--card)_82%,transparent)] p-[15px] shadow-[0_8px_30px_#302d3a0a]"
    >
      <ItemMedia className="size-9 rounded-xl bg-[color-mix(in_srgb,var(--primary)_11%,var(--card))] text-primary [&_svg]:w-4">
        {icon}
      </ItemMedia>
      <ItemContent className="min-w-0 gap-0">
        <ItemTitle className="mb-1 text-[13px] font-semibold">
          <span className="truncate">{title}</span>
          {badge && (
            <Badge className="rounded-[5px] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] px-1.5 py-0.5 text-[8px] font-normal text-primary">
              {badge}
            </Badge>
          )}
        </ItemTitle>
        <ItemDescription className="line-clamp-2 text-[9px] leading-[1.5]">{text}</ItemDescription>
      </ItemContent>
      <ItemActions className="gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-lg text-muted-foreground"
          aria-label={`${title}を編集`}
          onClick={edit}
        >
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-lg text-destructive hover:text-destructive"
          aria-label={`${title}を削除`}
          onClick={remove}
        >
          <Trash2 />
        </Button>
      </ItemActions>
    </Item>
  );
}
