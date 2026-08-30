import type { ReactNode } from "react";
import { SettingsShell } from "@/app/settings/_components/settings-shell";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <SettingsShell />
      {children}
    </>
  );
}
