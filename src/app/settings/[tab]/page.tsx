import { settingsTabs } from "@/lib/ui";

export function generateStaticParams() {
  return settingsTabs.map((tab) => ({ tab }));
}

export default function Page() {
  return null;
}
