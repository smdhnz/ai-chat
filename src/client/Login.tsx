import { motion } from "motion/react";
import { ease } from "./lib";

export function Login() {
  const error = new URLSearchParams(location.search).get("error");
  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden p-6">
      <motion.section
        className="relative w-[min(360px,100%)] text-center [&_h1]:mb-9 [&_h1]:text-[32px] [&_h1]:font-semibold [&_h1]:tracking-[-0.04em]"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease }}
      >
        <h1>Chat</h1>
        <a
          className="flex h-[50px] items-center justify-center rounded-xl bg-accent text-sm font-semibold text-white transition-colors duration-200 hover:bg-accent-2"
          href="/api/auth/discord"
        >
          Discordでログイン
        </a>
        {error && (
          <p className="mt-3.5 text-[13px] text-[#b54e4e]">
            {error === "forbidden"
              ? "このアカウントは利用できません。"
              : "ログインに失敗しました。"}
          </p>
        )}
      </motion.section>
    </main>
  );
}
