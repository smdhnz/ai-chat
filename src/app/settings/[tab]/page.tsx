import { settingsTabs } from "@/app/settings/_libs/settings";

export function generateStaticParams() {
  return settingsTabs.map((tab) => ({ tab }));
}

export default function Page() {
  return null;
}
