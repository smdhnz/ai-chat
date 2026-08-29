import { Suspense } from "react";
import { LoadingScreen } from "@/components/loading-screen";
import { ChatShell } from "@/app/(chat)/_components/chat-shell";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ChatShell />
      {children}
    </Suspense>
  );
}
