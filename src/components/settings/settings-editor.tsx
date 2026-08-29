"use client";

import { useId, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { api, type Project, type Skill } from "@/lib/api";
import { projectColorClasses, projectColors, projectIcons } from "@/lib/ui";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  dialogHeaderClass,
  dialogPanelClass,
  dialogTitleClass,
  drawerPanelClass,
} from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const fieldLabelClass = "text-[10px] font-bold text-muted-foreground";
const controlClass =
  "w-full rounded-[11px] border-border bg-background px-[11px] py-2.5 text-xs leading-[1.55] text-foreground shadow-none focus-visible:border-ring focus-visible:ring-0 md:text-xs";
const swatchClass =
  "size-[34px] rounded-[10px] border-border p-0 data-[state=on]:border-ring data-[state=on]:shadow-[0_0_0_2px_color-mix(in_srgb,var(--primary)_18%,transparent)]";

export function Editor({
  editor,
  open,
  onOpenChange,
  saved,
}: {
  editor: { type: "project" | "skill"; item?: Project | Skill };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saved: () => Promise<void>;
}) {
  const isSkill = editor.type === "skill";
  const item = editor.item;
  const skill = isSkill ? (item as Skill | undefined) : undefined;
  const project = !isSkill ? (item as Project | undefined) : undefined;
  const mobile = useIsMobile();
  const id = useId();
  const [name, setName] = useState(item?.name || "");
  const [description, setDescription] = useState(skill?.description || "");
  const [instructions, setInstructions] = useState(
    skill?.instructions || project?.system_prompt || "",
  );
  const [icon, setIcon] = useState(project?.icon || "folder");
  const [color, setColor] = useState(project?.color || "clay");
  const [enabled, setEnabled] = useState(skill?.enabled !== 0);
  const [saving, setSaving] = useState(false);
  const title = `${isSkill ? "スキル" : "プロジェクト"}${item ? "を編集" : "を作成"}`;

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

  const closeButton = (
    <Button
      variant="ghost"
      size="icon-lg"
      className="size-10 rounded-[13px] [&_svg:not([class*='size-'])]:size-5"
      type="button"
      aria-label="閉じる"
      onClick={() => onOpenChange(false)}
    >
      <X />
    </Button>
  );

  const fields = (
    <>
      <Field className="gap-[7px]">
        <FieldLabel htmlFor={`${id}-name`} className={fieldLabelClass}>
          名前
        </FieldLabel>
        <Input
          id={`${id}-name`}
          className={controlClass}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          required
          autoFocus
        />
      </Field>
      {!isSkill && (
        <>
          <FieldSet className="gap-[7px]">
            <FieldLegend variant="label" className={`mb-0 ${fieldLabelClass}`}>
              アイコン
            </FieldLegend>
            <ToggleGroup
              type="single"
              spacing={1}
              variant="outline"
              className="gap-[7px]"
              value={icon}
              // Radix clears the value when the active item is pressed again.
              onValueChange={(value) => value && setIcon(value)}
            >
              {Object.entries(projectIcons).map(([value, Icon]) => (
                <ToggleGroupItem
                  key={value}
                  value={value}
                  aria-label={value}
                  className={`${swatchClass} bg-background data-[state=on]:bg-background [&_svg:not([class*='size-'])]:size-4`}
                >
                  <Icon />
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FieldSet>
          <FieldSet className="gap-[7px]">
            <FieldLegend variant="label" className={`mb-0 ${fieldLabelClass}`}>
              色
            </FieldLegend>
            <ToggleGroup
              type="single"
              spacing={1}
              variant="outline"
              className="gap-[7px]"
              value={color}
              onValueChange={(value) => value && setColor(value)}
            >
              {projectColors.map((value) => (
                <ToggleGroupItem
                  key={value}
                  value={value}
                  aria-label={value}
                  className={`${swatchClass} ${projectColorClasses[value]} bg-[var(--project-color)] hover:bg-[var(--project-color)] data-[state=on]:bg-[var(--project-color)]`}
                />
              ))}
            </ToggleGroup>
          </FieldSet>
        </>
      )}
      {isSkill && (
        <Field className="gap-[7px]">
          <FieldLabel htmlFor={`${id}-description`} className={fieldLabelClass}>
            説明
          </FieldLabel>
          <Input
            id={`${id}-description`}
            className={controlClass}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={500}
            placeholder="いつ使うスキルか"
          />
        </Field>
      )}
      <Field className="gap-[7px]">
        <FieldLabel htmlFor={`${id}-instructions`} className={fieldLabelClass}>
          {isSkill ? "スキル指示" : "システムプロンプト"}
        </FieldLabel>
        <Textarea
          id={`${id}-instructions`}
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
      </Field>
      {isSkill && (
        <Field orientation="horizontal">
          <FieldLabel htmlFor={`${id}-enabled`} className={fieldLabelClass}>
            このスキルを有効にする
          </FieldLabel>
          <Switch id={`${id}-enabled`} size="lg" checked={enabled} onCheckedChange={setEnabled} />
        </Field>
      )}
    </>
  );

  const footerButtons = (
    <>
      <Button
        variant="ghost"
        className="h-[39px] text-[11px] font-normal text-muted-foreground hover:bg-transparent"
        type="button"
        onClick={() => onOpenChange(false)}
      >
        キャンセル
      </Button>
      <Button
        className="h-[39px] gap-1.5 rounded-xl px-[15px] text-[11px] font-bold shadow-[0_8px_20px_color-mix(in_srgb,var(--primary)_25%,transparent)]"
        disabled={saving}
      >
        {saving && <Spinner />}
        {saving ? "保存中" : "保存"}
      </Button>
    </>
  );

  if (mobile)
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className={`${drawerPanelClass} max-h-[88svh]`}>
          <DrawerHeader className={dialogHeaderClass}>
            <DrawerTitle className={dialogTitleClass}>{title}</DrawerTitle>
            <DrawerDescription className="sr-only">{title}</DrawerDescription>
            {closeButton}
          </DrawerHeader>
          <Separator />
          <form className="flex min-h-0 flex-col gap-[15px] overflow-auto p-5" onSubmit={submit}>
            <FieldGroup className="gap-[15px]">{fields}</FieldGroup>
            <DrawerFooter className="flex-row justify-end gap-2 p-0 pt-[7px] pb-[max(0px,env(safe-area-inset-bottom))]">
              {footerButtons}
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={`${dialogPanelClass} max-h-[min(760px,90svh)] gap-0 overflow-auto sm:max-w-[510px]`}
      >
        <DialogHeader className={dialogHeaderClass}>
          <DialogTitle className={dialogTitleClass}>{title}</DialogTitle>
          <DialogDescription className="sr-only">{title}</DialogDescription>
          {closeButton}
        </DialogHeader>
        <Separator />
        <form className="flex flex-col gap-[15px] p-5" onSubmit={submit}>
          <FieldGroup className="gap-[15px]">{fields}</FieldGroup>
          <DialogFooter className="flex-row justify-end gap-2 pt-[7px]">
            {footerButtons}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
