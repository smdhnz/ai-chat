import { SettingsShell } from "@/app/settings/_components/settings-shell";
import { settingsTabs } from "@/app/settings/_libs/settings";

export function generateStaticParams() {
  return settingsTabs.map((tab) => ({ tab }));
}

export default function Page() {
  return <SettingsShell />;
}
