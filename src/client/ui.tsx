import { useId, useState, type AnchorHTMLAttributes } from "react";
import { motion } from "motion/react";
import { Folder, Moon, Sun, Trash2, X } from "lucide-react";
import { type Project } from "./api";
import { ease, iconButtonClass, projectColorClasses, projectIcons, navigate } from "./lib";

export function ProjectIcon({
  project,
  className = "",
}: {
  project?: Project;
  className?: string;
}) {
  const Icon = projectIcons[project?.icon as keyof typeof projectIcons] || Folder;
  const color = project?.color as keyof typeof projectColorClasses;
  return (
    <span
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-[color-mix(in_srgb,var(--project-color)_13%,var(--panel))] text-[var(--project-color)] [&_svg]:w-4 ${projectColorClasses[color] || projectColorClasses.clay} ${className}`}
    >
      <Icon />
    </span>
  );
}

export function Link({
  href,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
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

export function ThemeButton({ dark, toggle }: { dark: boolean; toggle: () => void }) {
  const label = dark ? "ライトテーマに変更" : "ダークテーマに変更";
  return (
    <button className={iconButtonClass} onClick={toggle} aria-label={label} title={label}>
      {dark ? <Sun /> : <Moon />}
    </button>
  );
}

export function Modal({
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
      className="fixed inset-0 z-60 flex items-center justify-center bg-[#0c0d12a6] p-[18px] backdrop-blur-[5px] max-md:items-end max-md:p-0"
      onMouseDown={close}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="max-h-[min(760px,90svh)] w-[min(510px,100%)] overflow-auto rounded-3xl border border-line bg-panel shadow-[0_30px_100px_#06070a70] max-md:max-h-[88svh] max-md:w-full max-md:rounded-[25px_25px_0_0] max-md:border-b-0"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.3, ease }}
      >
        <header className="flex h-[62px] items-center border-b border-line pr-[18px] pl-[22px]">
          <strong className="flex-1" id={titleId}>
            {title}
          </strong>
          <button className={iconButtonClass} onClick={close}>
            <X />
          </button>
        </header>
        {children}
      </motion.div>
    </motion.div>
  );
}

export function ConfirmDialog({
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
      <div className="p-[22px]">
        <p className="m-0 text-[13px] leading-[1.7] text-muted">{text}</p>
        {error && <p className="mt-2.5 text-[13px] text-[#d15f6b]">{error}</p>}
        <div className="mt-[22px] flex justify-end gap-2 [&_button]:flex [&_button]:h-[38px] [&_button]:cursor-pointer [&_button]:items-center [&_button]:gap-1.5 [&_button]:rounded-[11px] [&_button]:border [&_button]:border-line [&_button]:bg-transparent [&_button]:px-3.5 [&_button]:text-text [&_button:disabled]:opacity-50 [&_svg]:w-3.5">
          <button onClick={close} disabled={deleting}>
            キャンセル
          </button>
          <button
            className="border-[color-mix(in_srgb,#de6b76_35%,var(--line))]! bg-[color-mix(in_srgb,#de6b76_10%,transparent)]! text-[#d15f6b]!"
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
