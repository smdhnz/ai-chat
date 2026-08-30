"use client";

import { motion } from "motion/react";
import { AlertCircle } from "lucide-react";
import { ease } from "@/lib/ui";

export function LoginForm({ error }: { error?: string }) {
  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden p-6">
      <motion.section
        className="relative w-[min(360px,100%)] text-center"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease }}
      >
        <h1 className="mb-9 text-[32px] font-semibold tracking-[-0.04em]">Chat</h1>
        <a
          className="inline-flex h-[50px] w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-colors duration-200 hover:bg-primary-hover"
          href="/api/auth/discord"
        >
          Discordでログイン
        </a>
        {error && (
          <div
            role="alert"
            className="mt-3.5 flex gap-2 rounded-[13px] border border-destructive/50 p-3 text-left text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p className="text-[13px]">
              {error === "forbidden"
                ? "このアカウントは利用できません。"
                : "ログインに失敗しました。"}
            </p>
          </div>
        )}
      </motion.section>
    </main>
  );
}
