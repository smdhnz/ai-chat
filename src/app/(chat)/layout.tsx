import { Suspense } from "react";
import { LoadingScreen } from "@/components/loading-screen";
import { ChatShell } from "@/components/chat/chat-shell";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ChatShell />
      {children}
    </Suspense>
  );
}
