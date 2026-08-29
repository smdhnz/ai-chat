"use client";

import { useState } from "react";
import { CircleAlert, Trash2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";

export const dialogPanelClass =
  "rounded-3xl border-border bg-card p-0 shadow-[0_30px_100px_#06070a70]";

export const drawerPanelClass = "rounded-t-[25px] border-border bg-card";

export const dialogHeaderClass =
  "flex h-[62px] shrink-0 flex-row items-center gap-0 space-y-0 pr-[18px] pl-[22px] text-left";

export const dialogTitleClass = "flex-1 text-base font-bold";

const cancelButtonClass = "h-[38px] rounded-[11px] border-border px-3.5 text-foreground";

const deleteButtonClass =
  "h-[38px] gap-1.5 rounded-[11px] border-[color-mix(in_srgb,#de6b76_35%,var(--border))] bg-[color-mix(in_srgb,#de6b76_10%,transparent)] px-3.5 text-destructive hover:bg-[color-mix(in_srgb,#de6b76_16%,transparent)] hover:text-destructive [&_svg:not([class*='size-'])]:size-3.5";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  text,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  text: string;
  onConfirm: () => Promise<void>;
}) {
  const mobile = useIsMobile();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  function change(next: boolean) {
    if (deleting) return;
    setError("");
    onOpenChange(next);
  }

  async function confirm() {
    setDeleting(true);
    try {
      await onConfirm();
      setDeleting(false);
      setError("");
      onOpenChange(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setDeleting(false);
    }
  }

  const errorAlert = error ? (
    <Alert variant="destructive" className="mt-2.5 rounded-[11px] border-border">
      <CircleAlert />
      <AlertDescription className="text-[13px]">{error}</AlertDescription>
    </Alert>
  ) : null;

  const deleteLabel = (
    <>
      {deleting ? <Spinner /> : <Trash2 />}
      {deleting ? "削除中" : "削除"}
    </>
  );

  if (mobile)
    return (
      <Drawer open={open} onOpenChange={change}>
        <DrawerContent className={drawerPanelClass}>
          <DrawerHeader className={dialogHeaderClass}>
            <DrawerTitle className={dialogTitleClass}>{title}</DrawerTitle>
          </DrawerHeader>
          <Separator />
          <div className="px-[22px] pt-[22px]">
            <DrawerDescription className="m-0 text-[13px] leading-[1.7]">{text}</DrawerDescription>
            {errorAlert}
          </div>
          <DrawerFooter className="flex-row justify-end gap-2 px-[22px] pt-[22px] pb-[max(22px,env(safe-area-inset-bottom))]">
            <Button
              variant="outline"
              className={cancelButtonClass}
              disabled={deleting}
              onClick={() => change(false)}
            >
              キャンセル
            </Button>
            <Button
              variant="outline"
              className={deleteButtonClass}
              disabled={deleting}
              onClick={() => void confirm()}
            >
              {deleteLabel}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );

  return (
    <AlertDialog open={open} onOpenChange={change}>
      <AlertDialogContent className={`${dialogPanelClass} gap-0 sm:max-w-[510px]`}>
        <AlertDialogHeader
          className={`${dialogHeaderClass} place-items-center justify-start sm:place-items-center`}
        >
          <AlertDialogTitle className={dialogTitleClass}>{title}</AlertDialogTitle>
        </AlertDialogHeader>
        <Separator />
        <div className="p-[22px]">
          <AlertDialogDescription className="m-0 text-[13px] leading-[1.7]">
            {text}
          </AlertDialogDescription>
          {errorAlert}
          <AlertDialogFooter className="mt-[22px] flex-row justify-end gap-2">
            <AlertDialogCancel className={cancelButtonClass} disabled={deleting}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              variant="outline"
              className={deleteButtonClass}
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void confirm();
              }}
            >
              {deleteLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
