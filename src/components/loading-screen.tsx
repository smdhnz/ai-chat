import { LoadingWave } from "@/components/loading-wave";

export function LoadingScreen() {
  return (
    <div className="flex h-svh items-center justify-center">
      <LoadingWave className="text-2xl text-primary" label="読み込み中" />
    </div>
  );
}
