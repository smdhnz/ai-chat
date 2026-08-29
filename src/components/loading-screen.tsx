import { Spinner } from "@/components/ui/spinner";

export function LoadingScreen() {
  return (
    <div className="flex h-svh items-center justify-center">
      <Spinner className="size-5 text-primary" aria-label="読み込み中" />
    </div>
  );
}
