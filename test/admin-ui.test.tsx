import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { sidebarConversations } from "../src/app/(chat)/_libs/chat";
import { MessageView } from "../src/app/(chat)/_components/message-view";
import { ChatSidebar } from "../src/app/(chat)/_components/chat-sidebar";
import { SettingsShell } from "../src/app/settings/_components/settings-shell";
import type { AdminConversation, Bootstrap, Conversation, Message } from "../src/lib/api";

const own: Conversation = {
  id: "own",
  project_id: null,
  title: "自分の会話",
  temporary: 0,
  generation_status: "idle",
  unread: 1,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};
const other: AdminConversation = {
  id: "other",
  user_id: "other-user",
  display_name: "他ユーザー",
  project_id: null,
  project_name: null,
  title: "他人の会話",
  temporary: 1,
  created_at: "2026-01-02",
  updated_at: "2026-01-02",
};
const data: Bootstrap = {
  is_admin: true,
  user: {
    id: "admin",
    username: "admin",
    display_name: "管理者",
    avatar: null,
    default_system_prompt: "",
  },
  users: [],
  invitations: [],
  projects: [],
  skills: [],
  conversations: [own],
  files: [],
};
const noop = () => {};

test("管理者一覧は通常一覧と統合し、所有者・読み取り専用・重複排除を維持、オフなら通常一覧だけ", () => {
  const adminOwn = { ...other, ...own, user_id: "admin", display_name: "管理者" };
  const items = sidebarConversations(data, [other, adminOwn]);
  expect(items.map((item) => item.id)).toEqual(["other", "own"]);
  expect(items[0].readOnly).toBe(true);
  expect(items[0].owner).toBe("他ユーザー");
  expect(items[1].readOnly).toBe(false);
  expect(items[1].unread).toBe(1);
  expect(sidebarConversations(data, null)).toBe(data.conversations);
  const shared = { ...own, id: other.id, project_id: "shared" };
  expect(sidebarConversations({ ...data, conversations: [shared] }, [other])[0].readOnly).toBe(
    true,
  );
});

test("通常サイドバーに他ユーザーの一時チャットも表示し削除操作を出さない", () => {
  const markup = renderToStaticMarkup(
    <ChatSidebar
      open
      onOpenChange={noop}
      data={data}
      conversationId="other"
      projectId=""
      newChat={noop}
      selectConversation={noop}
      askDeleteConversation={noop}
      openSettings={noop}
      adminMode
      items={sidebarConversations(data, [other])}
      adminLoading={false}
      adminError=""
      retryAdmin={noop}
    />,
  );
  expect(markup).toContain("他人の会話");
  expect(markup).toContain("他ユーザー");
  expect(markup).not.toContain("other-user");
  expect(markup).not.toContain('aria-label="他人の会話を削除"');
  expect(markup).toContain('aria-label="自分の会話を削除"');
  expect(markup).not.toContain("管理者モードをオンにする");
});

test("管理者一覧でもプロジェクト所属を保持し、プロジェクトなしへ混ぜない", () => {
  const shared = {
    ...other,
    id: "shared-chat",
    title: "共有内の会話",
    project_id: "shared",
    project_name: "共有プロジェクト",
  };
  const personal = {
    ...other,
    id: "personal-chat",
    title: "個人内の会話",
    project_id: "personal",
    project_name: "個人プロジェクト",
  };
  const items = sidebarConversations(data, [other, shared, personal]);
  expect(items.find((item) => item.id === shared.id)?.project_id).toBe("shared");
  const sidebar = (projectId: string) =>
    renderToStaticMarkup(
      <ChatSidebar
        open
        onOpenChange={noop}
        data={data}
        conversationId={null}
        projectId={projectId}
        newChat={noop}
        selectConversation={noop}
        askDeleteConversation={noop}
        openSettings={noop}
        adminMode
        items={items}
        adminLoading={false}
        adminError=""
        retryAdmin={noop}
      />,
    );
  expect(sidebar("")).toContain("他人の会話");
  expect(sidebar("")).not.toContain("共有内の会話");
  expect(sidebar("")).not.toContain("個人内の会話");
  expect(sidebar("shared")).toContain("共有内の会話");
  expect(sidebar("shared")).not.toContain("他人の会話");
  expect(sidebar("personal")).toContain("個人内の会話");
  expect(sidebar("personal")).toContain(
    'aria-label="個人プロジェクトで新しいチャット" disabled=""',
  );
});

test("管理者の設定内だけにモード切替を表示する", () => {
  const settings = (bootstrap: Bootstrap) =>
    renderToStaticMarkup(
      <SettingsShell
        open
        onOpenChange={noop}
        data={bootstrap}
        setData={noop}
        adminMode
        onAdminModeChange={noop}
      />,
    );
  expect(settings(data)).toContain('role="switch"');
  expect(settings(data)).toContain("管理者モード");
  expect(settings({ ...data, is_admin: false })).not.toContain("管理者モード");
});

test("通常のメッセージ表示を読み取り専用にし、画像は管理者API・本文の外部画像は読み込まない", () => {
  const message: Message = {
    id: "message",
    role: "user",
    content: "![外部画像](https://example.com/tracker.png)",
    created_at: "2026-01-02",
    files: [
      {
        id: "image",
        name: "photo.png",
        mime: "image/png",
        size: 10,
        source: "upload",
        created_at: "2026-01-02",
      },
    ],
  };
  const markup = renderToStaticMarkup(
    <MessageView
      message={message}
      disabled={false}
      regenerate={noop}
      edit={noop}
      shared={false}
      prioritizeImages={false}
      readOnly
      fileBaseUrl="/api/admin/conversations/other/images"
    />,
  );
  expect(markup).toContain("/api/admin/conversations/other/images/image?preview");
  expect(markup).not.toContain("編集して再生成");
  expect(markup).not.toContain("このメッセージから再生成");
  const assistant = renderToStaticMarkup(
    <MessageView
      message={{ ...message, role: "assistant" }}
      disabled={false}
      regenerate={noop}
      edit={noop}
      shared={false}
      prioritizeImages={false}
      readOnly
    />,
  );
  expect(assistant).not.toContain('src="https://example.com/tracker.png"');
  const normal = renderToStaticMarkup(
    <MessageView
      message={message}
      disabled={false}
      regenerate={noop}
      edit={noop}
      shared={false}
      prioritizeImages={false}
    />,
  );
  expect(normal).toContain("編集して再生成");
  expect(normal).toContain("/files/image?preview");
});
