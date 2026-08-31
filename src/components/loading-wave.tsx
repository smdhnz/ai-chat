export function LoadingWave({ label, className = "" }: { label?: string; className?: string }) {
  return (
    <span
      className={`loading-wave inline-flex h-[1em] w-[1.35em] items-center justify-center gap-[0.12em] ${className}`}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <span />
      <span />
      <span />
    </span>
  );
}
