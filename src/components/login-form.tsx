"use client";

import { motion } from "motion/react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
        <Button
          asChild
          className="h-[50px] w-full rounded-xl text-sm font-semibold transition-colors duration-200 hover:bg-primary-hover"
        >
          <a href="/api/auth/discord">Discordでログイン</a>
        </Button>
        {error && (
          <Alert variant="destructive" className="mt-3.5 rounded-[13px] text-left">
            <AlertCircle />
            <AlertDescription className="text-[13px]">
              {error === "forbidden"
                ? "このアカウントは利用できません。"
                : "ログインに失敗しました。"}
            </AlertDescription>
          </Alert>
        )}
      </motion.section>
    </main>
  );
}
