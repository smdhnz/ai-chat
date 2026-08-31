"use client";

import { useId, useState, type FormEvent } from "react";
import { LoadingWave } from "@/components/loading-wave";
import { api, type Project, type Skill } from "@/lib/api";

const fieldLabelClass = "text-[10px] font-bold text-muted-foreground";
const controlClass =
  "w-full rounded-[11px] border border-border bg-background px-[11px] py-2.5 text-xs leading-[1.55] text-foreground outline-none focus:border-ring";
export function Editor({
  editor,
  saved,
  cancel,
}: {
  editor: { type: "project" | "skill"; item?: Project | Skill };
  saved: () => Promise<void>;
  cancel: () => void;
}) {
  const isSkill = editor.type === "skill";
  const item = editor.item;
  const skill = isSkill ? (item as Skill | undefined) : undefined;
  const project = !isSkill ? (item as Project | undefined) : undefined;
  const id = useId();
  const [name, setName] = useState(item?.name || "");
  const [description, setDescription] = useState(skill?.description || "");
  const [instructions, setInstructions] = useState(
    skill?.instructions || project?.system_prompt || "",
  );
  const [enabled, setEnabled] = useState(skill?.enabled !== 0);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const path = `/api/${isSkill ? "skills" : "projects"}${item ? `/${item.id}` : ""}`;
      await api(path, {
        method: item ? "PUT" : "POST",
        body: JSON.stringify(
          isSkill
            ? { name, description, instructions, enabled }
            : { name, systemPrompt: instructions },
        ),
      });
      await saved();
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
        />
      </label>
      {isSkill && (
        <label className="flex flex-col gap-[7px]" htmlFor={`${id}-description`}>
          <span className={fieldLabelClass}>説明</span>
          <input
            id={`${id}-description`}
            className={controlClass}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={500}
            placeholder="いつ使うスキルか"
          />
        </label>
      )}
      <label className="flex flex-col gap-[7px]" htmlFor={`${id}-instructions`}>
        <span className={fieldLabelClass}>{isSkill ? "スキル指示" : "システムプロンプト"}</span>
        <textarea
          id={`${id}-instructions`}
          className={`${controlClass} min-h-[180px] resize-y`}
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
        <label className="flex min-h-11 items-center justify-between gap-4">
          <span className={fieldLabelClass}>このスキルを有効にする</span>
          <input
            type="checkbox"
            className="size-5 accent-primary"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
        </label>
      )}
      <footer className="flex justify-end gap-2 pt-[7px] pb-[max(0px,env(safe-area-inset-bottom))]">
        <button
          type="button"
          className="h-[39px] px-3 text-[11px] text-muted-foreground"
          disabled={saving}
          onClick={cancel}
        >
          キャンセル
        </button>
        <button
          className="inline-flex h-[39px] items-center gap-1.5 rounded-xl bg-[linear-gradient(150deg,#c99bc5,#9f7ab8)] px-[15px] text-[11px] font-bold text-primary-foreground shadow-[0_8px_20px_color-mix(in_srgb,#9f7ab8_25%,transparent)] disabled:opacity-50"
          disabled={saving}
        >
          {saving && <LoadingWave className="text-sm" />}
          {saving ? "保存中" : "保存"}
        </button>
      </footer>
    </form>
  );
}
