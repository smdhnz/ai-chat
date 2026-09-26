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

test("空の失敗応答も折りたたみを開かずエラーを表示する", () => {
  for (const status of ["failed", "completed"] as const) {
    const markup = renderToStaticMarkup(
      <MessageView
        message={{
          id: "run",
          role: "assistant",
          content: "",
          status,
          created_at: "2026-01-02",
          files: [],
        }}
        disabled={false}
        regenerate={noop}
        edit={noop}
        shared={false}
        prioritizeImages={false}
      />,
    );
    expect(markup.includes('role="alert"')).toBe(status === "failed");
    expect(markup.includes("応答に失敗しました。再生成してください。")).toBe(status === "failed");
  }
});

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

test("管理者の設定内だけにモード切替と常時利用できるCodex再認証を表示する", () => {
  const settings = (bootstrap: Bootstrap, adminMode = true) =>
    renderToStaticMarkup(
      <SettingsShell
        open
        onOpenChange={noop}
        data={bootstrap}
        setData={noop}
        adminMode={adminMode}
        onAdminModeChange={noop}
      />,
    );
  expect(settings(data)).toContain('role="switch"');
  expect(settings(data)).toContain("管理者モード");
  expect(settings({ ...data, is_admin: false })).not.toContain("管理者モード");
  expect(settings(data)).toContain("Codexを再認証");
  expect(settings(data, false)).toContain("Codexを再認証");
  expect(settings({ ...data, is_admin: false })).not.toContain("Codexを再認証");
});

test("サイドバーの会話更新日時は管理者モード時だけ日本時間で表示する", () => {
  const updated_at = "2026-01-02T03:04:00.000Z";
  for (const adminMode of [true, false]) {
    const markup = renderToStaticMarkup(
      <ChatSidebar
        open
        onOpenChange={noop}
        data={data}
        conversationId={null}
        projectId=""
        newChat={noop}
        selectConversation={noop}
        askDeleteConversation={noop}
        openSettings={noop}
        adminMode={adminMode}
        items={[{ ...own, updated_at }]}
        adminLoading={false}
        adminError=""
        retryAdmin={noop}
      />,
    );
    expect(markup.includes(`<time dateTime="${updated_at}"`)).toBe(adminMode);
    expect(markup.includes("2026/01/02 12:04")).toBe(adminMode);
  }
});

test("各メッセージの送信日時は読み取り専用かどうかによらず管理者モード時だけ表示する", () => {
  for (const role of ["user", "assistant"] as const) {
    for (const adminMode of [true, false]) {
      for (const readOnly of [true, false]) {
        const created_at = "2026-01-02T03:04:00.000Z";
        const markup = renderToStaticMarkup(
          <MessageView
            message={{ id: "message", role, content: "本文", created_at, files: [] }}
            disabled={false}
            regenerate={noop}
            edit={noop}
            shared={false}
            prioritizeImages={false}
            adminMode={adminMode}
            readOnly={readOnly}
          />,
        );
        expect(markup.includes(`<time dateTime="${created_at}"`)).toBe(adminMode);
        expect(markup.includes("2026/01/02 12:04")).toBe(adminMode);
      }
    }
  }
});

test("通常のメッセージ表示を読み取り専用にし、添付は管理者API・本文の外部画像は通常と同じ表示", () => {
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
      fileBaseUrl="/api/admin/conversations/other/files"
    />,
  );
  expect(markup).toContain("/api/admin/conversations/other/files/image?preview");
  expect(markup).not.toContain("編集して再生成");
  expect(markup).not.toContain("このメッセージから再生成");
  const assistant = renderToStaticMarkup(
    <MessageView
      message={{
        ...message,
        role: "assistant",
        content: `${message.content}\n\n**回答**\n\n\`\`\`ts\nconst answer = 42;\n\`\`\`\n\n![添付](/files/image)\n\n[文書](/files/document?download)\n\n[不正](javascript:alert)`,
        activities: [{ type: "reasoning", text: "保存済みの思考" }],
      }}
      disabled={false}
      regenerate={noop}
      edit={noop}
      shared={false}
      prioritizeImages={false}
      readOnly
      fileBaseUrl="/api/admin/conversations/other/files"
    />,
  );
  expect(assistant).toContain('src="https://example.com/tracker.png"');
  expect(assistant).toContain("<strong>回答</strong>");
  expect(assistant).toContain('src="/api/admin/conversations/other/files/image"');
  expect(assistant).toContain('href="/api/admin/conversations/other/files/document?download"');
  expect(assistant).not.toContain('href="javascript:');
  expect(assistant).toContain('aria-label="コードをコピー"');
  expect(assistant).toContain("1件の処理");
  expect(assistant).toContain('aria-expanded="false"');
  expect(assistant).not.toContain("編集して再生成");
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

test("管理者も通常と同じMarkdown・処理履歴・公開認証カード・生成中表示を使う", () => {
  for (const message of [
    {
      id: "stream-run",
      content: "**生成中**\n\n![外部画像](https://example.com/image.png)",
      activities: [
        { type: "reasoning", text: "思考" },
        { type: "tool", name: "inspect_image", summary: "画像を確認中", status: "running" },
      ],
    },
    {
      id: "auth",
      content:
        "OpenAI Codexの再認証が必要です。\n\n[認証ページを開く](https://example.com/device)\n\nコード: `DEVICE-CODE`",
    },
  ] satisfies Partial<Message>[]) {
    const render = (readOnly: boolean) =>
      renderToStaticMarkup(
        <MessageView
          message={{ role: "assistant", files: [], created_at: "2026-01-02", ...message }}
          disabled={false}
          regenerate={noop}
          edit={noop}
          shared={false}
          prioritizeImages={false}
          readOnly={readOnly}
        />,
      );
    expect(render(true)).toBe(render(false));
    expect(render(true)).toContain(message.id === "auth" ? "認証コードをコピー" : "画像を確認");
  }
});
