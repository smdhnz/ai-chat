import { LoaderCircle } from "lucide-react";

export function LoadingScreen() {
  return (
    <div className="flex h-svh items-center justify-center">
      <LoaderCircle className="size-5 animate-spin text-primary" aria-label="読み込み中" />
    </div>
  );
}
