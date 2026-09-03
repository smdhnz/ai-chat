"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { ChevronRight, Sparkles, Trash2, UserMinus, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { LoadingWave } from "@/components/loading-wave";
import { api, type Project, type Skill, type UserSummary } from "@/lib/api";

const fieldLabelClass = "text-[10px] font-bold text-muted-foreground";
const controlClass =
  "w-full rounded-[11px] border border-border bg-background px-[11px] py-2.5 text-xs leading-[1.55] text-foreground outline-none focus:border-ring disabled:opacity-70";

export function Editor({
  item,
  users,
  saved,
  cancel,
  refresh,
  showSkills,
}: {
  item?: Project;
  users: UserSummary[];
  saved: () => Promise<void>;
  cancel: () => void;
  refresh: () => Promise<Project | null>;
  showSkills: (draft: Project) => void;
}) {
  const id = useId();
  const [project, setProject] = useState(item);
  const [name, setName] = useState(item?.name || "");
  const [instructions, setInstructions] = useState(item?.system_prompt || "");
  const [saving, setSaving] = useState(false);
  const editable = !project || project.is_owner;
  const unavailable = new Set([
    project?.owner.id,
    ...(project?.members.map((member) => member.id) ?? []),
    ...(project?.pending_invitations.map((member) => member.id) ?? []),
  ]);
  const candidates = users.filter((user) => !unavailable.has(user.id));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!editable) return;
    setSaving(true);
    try {
      await api(`/api/projects${project ? `/${project.id}` : ""}`, {
        method: project ? "PUT" : "POST",
        body: JSON.stringify({ name, systemPrompt: instructions }),
      });
      await saved();
    } finally {
      setSaving(false);
    }
  }

  async function mutate(path: string, method: "POST" | "DELETE", body?: object) {
    setSaving(true);
    try {
      await api(path, { method, body: body ? JSON.stringify(body) : undefined });
      const next = await refresh();
      if (!next) cancel();
      else setProject(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作できませんでした");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="flex flex-col gap-[15px] p-5 pb-8" onSubmit={submit}>
      <label className="flex flex-col gap-[7px]" htmlFor={`${id}-name`}>
        <span className={fieldLabelClass}>名前</span>
        <input
          id={`${id}-name`}
          className={controlClass}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          required
          disabled={!editable}
        />
      </label>
      <label className="flex flex-col gap-[7px]" htmlFor={`${id}-instructions`}>
        <span className={fieldLabelClass}>システムプロンプト</span>
        <textarea
          id={`${id}-instructions`}
          className={`${controlClass} min-h-[180px] resize-y`}
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          rows={11}
          maxLength={30000}
          placeholder="このプロジェクトでの人格、役割、回答方針"
          disabled={!editable}
        />
      </label>

      {project ? (
        <button
          type="button"
          className="flex min-h-[54px] w-full items-center gap-3 rounded-[11px] bg-card px-3.5 text-left"
          onClick={() => showSkills({ ...project, name, system_prompt: instructions })}
        >
          <span className="flex size-8 items-center justify-center text-primary [&_svg]:size-[17px]">
            <Sparkles />
          </span>
          <span className="flex-1 text-[13px]">スキル</span>
          <span className="text-[12px] text-muted-foreground">{project.skills.length}</span>
          <ChevronRight className="size-[17px] text-muted-foreground/60" />
        </button>
      ) : null}
      {project ? (
        <section className="flex flex-col gap-2 pt-2" aria-labelledby={`${id}-members`}>
          <h3 id={`${id}-members`} className={fieldLabelClass}>
            メンバー
          </h3>
          <div className="overflow-hidden rounded-[11px] bg-card">
            <MemberRow user={project.owner} label="オーナー" />
            {project.members.map((member) => (
              <MemberRow
                key={member.id}
                user={member}
                action={
                  project.is_owner ? (
                    <button
                      type="button"
                      className="inline-flex size-8 items-center justify-center text-destructive [&_svg]:size-4"
                      aria-label={`${member.display_name}を除外`}
                      disabled={saving}
                      onClick={() =>
                        void mutate(`/api/projects/${project.id}/members/${member.id}`, "DELETE")
                      }
                    >
                      <UserMinus />
                    </button>
                  ) : undefined
                }
              />
            ))}
            {project.pending_invitations.map((member) => (
              <MemberRow
                key={member.id}
                user={member}
                label="招待中"
                action={
                  project.is_owner ? (
                    <button
                      type="button"
                      className="inline-flex size-8 items-center justify-center text-muted-foreground [&_svg]:size-4"
                      aria-label={`${member.display_name}への招待を取り消す`}
                      disabled={saving}
                      onClick={() =>
                        void mutate(
                          `/api/projects/${project.id}/invitations/${member.id}`,
                          "DELETE",
                        )
                      }
                    >
                      <X />
                    </button>
                  ) : undefined
                }
              />
            ))}
          </div>
          {project.is_owner && candidates.length > 0 ? (
            <div className="pt-2">
              <h3 className={`${fieldLabelClass} mb-2`}>招待するユーザー</h3>
              <div className="overflow-hidden rounded-[11px] bg-card">
                {candidates.map((user) => (
                  <MemberRow
                    key={user.id}
                    user={user}
                    action={
                      <button
                        type="button"
                        className="inline-flex size-8 items-center justify-center text-primary disabled:opacity-50 [&_svg]:size-4"
                        aria-label={`${user.display_name}を招待`}
                        disabled={saving}
                        onClick={() =>
                          void mutate(`/api/projects/${project.id}/invitations`, "POST", {
                            userId: user.id,
                          })
                        }
                      >
                        <UserPlus />
                      </button>
                    }
                  />
                ))}
              </div>
            </div>
          ) : null}
          {!project.is_owner ? (
            <button
              type="button"
              className="mt-2 h-10 text-[11px] text-destructive"
              disabled={saving}
              onClick={() => void mutate(`/api/projects/${project.id}/leave`, "POST")}
            >
              プロジェクトから退出
            </button>
          ) : null}
        </section>
      ) : null}

      <footer className="flex justify-end gap-2 pt-[7px] pb-[max(0px,env(safe-area-inset-bottom))]">
        <button
          type="button"
          className="h-[39px] px-3 text-[11px] text-muted-foreground"
          disabled={saving}
          onClick={cancel}
        >
          {editable ? "キャンセル" : "閉じる"}
        </button>
        {editable ? (
          <button
            className="inline-flex h-[39px] items-center gap-1.5 rounded-xl bg-[linear-gradient(150deg,#c99bc5,#9f7ab8)] px-[15px] text-[11px] font-bold text-primary-foreground shadow-[0_8px_20px_color-mix(in_srgb,#9f7ab8_25%,transparent)] disabled:opacity-50"
            disabled={saving}
          >
            {saving ? <LoadingWave className="text-sm" /> : null}
            {saving ? "保存中" : "保存"}
          </button>
        ) : null}
      </footer>
    </form>
  );
}

export function SkillManager({
  skills,
  editable = true,
  detail,
  remove,
  refresh,
}: {
  skills: Skill[];
  editable?: boolean;
  detail: (skill: Skill) => void;
  remove: (skill: Skill) => void;
  refresh: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const builtin = skills.filter((skill) => skill.source === "builtin");
  const installed = skills.filter((skill) => skill.source !== "builtin");
  async function toggle(skill: Skill) {
    setLoading(true);
    try {
      await api(`/api/skills/${skill.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: skill.name,
          description: skill.description,
          instructions: skill.instructions,
          enabled: skill.enabled === 0,
        }),
      });
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存できませんでした");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-label="スキル">
      {builtin.length ? (
        <div>
          <p className={`${fieldLabelClass} mb-2`}>組み込みスキル</p>
          <div className="overflow-hidden rounded-[11px] bg-card">
            {builtin.map((skill) => (
              <div
                key={skill.id}
                className="flex min-h-14 items-center gap-2 border-b border-border px-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1 py-2">
                  <p className="truncate text-xs font-semibold">{skill.name}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{skill.description}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked="true"
                  aria-label={`${skill.name}は常時有効`}
                  disabled
                  className="relative h-6 w-10 shrink-0 rounded-full bg-primary opacity-50 transition-colors duration-200 motion-reduce:transition-none"
                >
                  <span className="absolute top-1 left-1 size-4 translate-x-4 rounded-full bg-white shadow-sm transition-transform duration-200 motion-reduce:transition-none" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div>
        <p className={`${fieldLabelClass} mb-2`}>追加済みスキル</p>
        {installed.length ? (
          <div className="overflow-hidden rounded-[11px] bg-card">
            {installed.map((skill) => (
              <div
                key={skill.id}
                className="flex min-h-14 items-center gap-2 border-b border-border px-3 last:border-b-0"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 py-2 text-left"
                  onClick={() => detail(skill)}
                >
                  <span className="block truncate text-xs font-semibold">{skill.name}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {skill.description || skill.source_id}
                  </span>
                </button>
                {editable ? (
                  <>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={skill.enabled !== 0}
                      aria-label={`${skill.name}を${skill.enabled ? "無効化" : "有効化"}`}
                      disabled={loading}
                      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200 motion-reduce:transition-none ${skill.enabled ? "bg-primary" : "bg-muted"}`}
                      onClick={() => void toggle(skill)}
                    >
                      <span
                        className={`absolute top-1 left-1 size-4 rounded-full bg-white shadow-sm transition-transform duration-200 motion-reduce:transition-none ${skill.enabled ? "translate-x-4" : ""}`}
                      />
                    </button>
                    <button
                      type="button"
                      className="inline-flex size-8 shrink-0 items-center justify-center text-destructive [&_svg]:size-4"
                      aria-label={`${skill.name}を削除`}
                      onClick={() => remove(skill)}
                    >
                      <Trash2 />
                    </button>
                  </>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">追加済みスキルはありません。</p>
        )}
      </div>
    </section>
  );
}

function MemberRow({
  user,
  label,
  action,
}: {
  user: UserSummary;
  label?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-12 items-center gap-2.5 border-b border-border px-3 last:border-b-0">
      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[11px] font-bold">
        {user.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="size-full object-cover" src={user.avatar} alt="" />
        ) : (
          user.display_name[0]
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs">{user.display_name}</span>
      {label ? <span className="text-[9px] text-muted-foreground">{label}</span> : null}
      {action}
    </div>
  );
}
