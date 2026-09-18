"use client";

import { useEffect, useState } from "react";
import {
  api,
  type AdminConversation,
  type AdminConversationPage,
  type MessagePage,
} from "@/lib/api";
import { NativeDialog } from "@/components/native-dialog";
import { FileBlocks } from "./message-view";

const buttonClass =
  "min-h-11 rounded-xl border border-border px-4 py-2 text-sm disabled:opacity-50";

export function AdminMode({ close }: { close: () => void }) {
  const [conversation, setConversation] = useState<AdminConversation | null>(null);
  return (
    <NativeDialog
      open
      onClose={close}
      label="管理者モード"
      className="fixed inset-0 size-full"
      closeOnBackdrop={false}
    >
      <section className="flex h-full flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <header className="shrink-0 border-b border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-warning">管理者モード ON</h2>
            <button type="button" className={buttonClass} onClick={close}>
              オフにする
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            全ユーザーの会話・画像を閲覧中（読み取り専用）
          </p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {conversation ? (
            <>
              <button type="button" className={buttonClass} onClick={() => setConversation(null)}>
                一覧に戻る
              </button>
              <h3 className="mt-4 break-words font-semibold">{conversation.title}</h3>
              <p className="mb-4 break-words text-xs text-muted-foreground">
                {conversation.display_name} · {conversation.user_id}
              </p>
              <AdminMessages key={conversation.id} conversationId={conversation.id} />
            </>
          ) : (
            <AdminConversations select={setConversation} />
          )}
        </div>
      </section>
    </NativeDialog>
  );
}

function AdminConversations({ select }: { select: (conversation: AdminConversation) => void }) {
  const [page, setPage] = useState<AdminConversationPage | null>(null);
  const [before, setBefore] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void api<AdminConversationPage>(
      `/api/admin/conversations${before ? `?before=${encodeURIComponent(before)}` : ""}`,
      { signal: controller.signal },
    )
      .then((next) => {
        if (!controller.signal.aborted)
          setPage((current) => ({
            ...next,
            conversations: [
              ...(before ? (current?.conversations ?? []) : []),
              ...next.conversations,
            ],
          }));
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setPage(null);
          setError(error instanceof Error ? error.message : "取得できませんでした");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [before, retry]);
  return (
    <>
      <h3 className="mb-3 font-semibold">全ユーザーのチャット</h3>
      {error ? <p role="alert">{error}</p> : null}
      {loading ? <p role="status">読み込み中…</p> : null}
      <ul className="space-y-2">
        {page?.conversations.map((conversation) => (
          <li key={conversation.id}>
            <button
              type="button"
              className="w-full rounded-xl border border-border p-3 text-left"
              onClick={() => select(conversation)}
            >
              <span className="block break-words text-sm">{conversation.title}</span>
              <span className="mt-1 block break-words text-xs text-muted-foreground">
                {conversation.display_name} · {conversation.user_id}
                {conversation.temporary ? " · 一時チャット" : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {page && !page.conversations.length ? <p>チャットはありません</p> : null}
      {page?.hasMore ? (
        <button
          type="button"
          className={`${buttonClass} mt-4`}
          disabled={loading}
          onClick={() => setBefore(page.conversations.at(-1)!.id)}
        >
          もっと見る
        </button>
      ) : null}
      {error ? (
        <button
          type="button"
          className={`${buttonClass} mt-4`}
          onClick={() => {
            setBefore("");
            setRetry((value) => value + 1);
          }}
        >
          再試行
        </button>
      ) : null}
    </>
  );
}

function AdminMessages({ conversationId }: { conversationId: string }) {
  const [page, setPage] = useState<MessagePage | null>(null);
  const [before, setBefore] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void api<MessagePage>(
      `/api/admin/conversations/${conversationId}${before ? `?before=${encodeURIComponent(before)}` : ""}`,
      { signal: controller.signal },
    )
      .then((next) => {
        if (!controller.signal.aborted)
          setPage((current) => ({
            ...next,
            messages: [...next.messages, ...(before ? (current?.messages ?? []) : [])],
          }));
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setPage(null);
          setError(error instanceof Error ? error.message : "取得できませんでした");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [conversationId, before, retry]);
  return (
    <>
      {error ? <p role="alert">{error}</p> : null}
      {loading ? <p role="status">読み込み中…</p> : null}
      {page?.hasMore ? (
        <button
          type="button"
          className={`${buttonClass} mb-4`}
          disabled={loading}
          onClick={() => setBefore(page.messages[0].id)}
        >
          以前のメッセージを表示
        </button>
      ) : null}
      {page?.messages.map((message) => (
        <article key={message.id} className="mb-5 rounded-xl border border-border p-3">
          <p className="mb-2 text-xs text-muted-foreground">
            {message.role === "user" ? "ユーザー" : "AI"} ·{" "}
            {new Date(message.created_at).toLocaleString("ja-JP")}
          </p>
          {/* Plain text avoids loading URLs embedded by another user while viewing their chat. */}
          <p className="break-words whitespace-pre-wrap text-sm">{message.content}</p>
          <FileBlocks
            files={message.files}
            prioritizeImages={false}
            fileBaseUrl={`/api/admin/conversations/${conversationId}/images`}
            imageContextLabel="管理者モード ON・画像閲覧（読み取り専用）"
          />
        </article>
      ))}
      {page && !page.messages.length ? <p>メッセージはありません</p> : null}
      {error ? (
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            setBefore("");
            setRetry((value) => value + 1);
          }}
        >
          再試行
        </button>
      ) : null}
    </>
  );
}
