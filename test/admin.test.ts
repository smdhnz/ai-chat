import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import type { AdminConversationPage, MessagePage } from "../src/lib/api";

const root = join(import.meta.dir, "..");

async function fixture(adminIds = " , 100 , ") {
  const directory = mkdtempSync(join(tmpdir(), "ai-chat-admin-"));
  const child = Bun.spawn(
    [
      process.execPath,
      "-e",
      'const {server} = await import("./src/api/server.ts"); console.log("READY:" + server.port);',
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        DATA_DIR: directory,
        PORT: "0",
        APP_ORIGIN: "http://localhost:3000",
        DISCORD_CLIENT_ID: "test",
        DISCORD_CLIENT_SECRET: "test",
        ALLOWED_DISCORD_USER_IDS: "100,200",
        ADMIN_DISCORD_USER_IDS: adminIds,
        CODEX_MODEL: "gpt-5.6-sol",
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  let db: Database | undefined;
  const dispose = async () => {
    child.kill();
    await child.exited;
    db?.close();
    rmSync(directory, { recursive: true, force: true });
  };
  try {
    const reader = child.stdout.getReader();
    let output = "";
    const port = await Promise.race([
      (async () => {
        while (true) {
          const { value, done } = await reader.read();
          if (done) throw new Error("test API exited before ready");
          output += new TextDecoder().decode(value);
          const match = output.match(/READY:(\d+)/);
          if (match) return Number(match[1]);
        }
      })(),
      new Promise<never>((_, reject) => {
        const timer = setTimeout(() => reject(new Error("test API startup timeout")), 10_000);
        timer.unref();
      }),
    ]);
    reader.releaseLock();
    db = new Database(join(directory, "chat.sqlite"));
    db.exec(`
      INSERT INTO users (id,username,display_name,created_at,updated_at) VALUES
        ('100','admin','Admin','2026','2026'), ('200','user','User','2026','2026');
      INSERT INTO conversations (id,user_id,title,temporary,created_at,updated_at) VALUES
        ('private','200','private title',0,'2026','2026'),
        ('temporary','200','temporary title',1,'2026','2026'),
        ('own','100','own title',0,'2026','2026');
      INSERT INTO conversation_reads VALUES ('private','200',1);
    `);
    for (const userId of ["100", "200"])
      db.query("INSERT INTO sessions VALUES (?, ?, '2099-01-01T00:00:00.000Z')").run(
        new Bun.CryptoHasher("sha256").update(`session-${userId}`).digest("hex"),
        userId,
      );
    const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } })
      .png()
      .toBuffer();
    for (const [id, mime, content] of [
      ["attached", "image/png", image],
      ["generated", "image/png", image],
      ["unattached", "image/png", image],
      ["document", "text/plain", "private document"],
      ["fake", "image/png", "not an image"],
    ] as const) {
      const path = join(directory, id);
      writeFileSync(path, content);
      db.query("INSERT INTO files VALUES (?, '200', ?, ?, ?, 1, ?, '2026')").run(
        id,
        `${id}.png`,
        path,
        mime,
        id === "generated" ? "generated" : "upload",
      );
    }
    const message = (id: string, sequence: number, content: unknown[], role = "user") =>
      db!
        .query(
          "INSERT INTO conversation_entries VALUES (?, 'private', NULL, ?, ?, ?, '2026-01-01')",
        )
        .run(
          id,
          sequence,
          role === "toolResult" ? "tool_result" : `${role}_message`,
          JSON.stringify({
            role,
            content,
            attachmentContext: "hidden attachment text",
            api: "openai-responses",
            provider: "openai-codex",
            model: "test",
            usage: {},
            stopReason: "stop",
            toolName: "generate_image",
            toolCallId: "call",
            isError: false,
          }),
        );
    message("user-message", 1, [
      { type: "text", text: "private body" },
      ...["attached", "document", "fake"].map((fileId) => ({ type: "imageRef", fileId })),
    ]);
    message(
      "assistant-message",
      2,
      [
        { type: "text", text: "assistant body" },
        { type: "thinking", thinking: "hidden reasoning" },
      ],
      "assistant",
    );
    message(
      "generated-message",
      3,
      [
        { type: "text", text: "hidden tool data" },
        { type: "imageRef", fileId: "generated" },
      ],
      "toolResult",
    );
    message(
      "auth-message",
      4,
      [
        {
          type: "text",
          text: "OpenAI Codexの再認証が必要です。\n\n[認証ページを開く](https://example.com/device)\n\nコード: `SECRET-CODE`",
        },
      ],
      "assistant",
    );
    const request = (
      path: string,
      userId: string | null = "100",
      method = "GET",
      body?: BodyInit,
    ) =>
      fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: {
          ...(userId ? { cookie: `session=session-${userId}` } : {}),
          origin: "http://localhost:3000",
        },
        body,
        redirect: "manual",
      });
    return { directory, db, request, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}

test("admin GET経路だけで本文・画像を閲覧し、分離・読み取り専用・監査を維持する", async () => {
  const { directory, db, request, dispose } = await fixture();
  try {
    const bootstrap = await (await request("/api/bootstrap")).json();
    expect(bootstrap.is_admin).toBe(true);
    expect(bootstrap.conversations.map((conversation: { id: string }) => conversation.id)).toEqual([
      "own",
    ]);
    expect((await (await request("/api/bootstrap", "200")).json()).is_admin).toBeUndefined();
    const before = db.serialize();
    for (const path of [
      "/api/admin/conversations",
      "/api/admin/conversations/private",
      "/api/admin/conversations/private/images/attached",
    ]) {
      expect((await request(path, null)).status).toBe(401);
      expect((await request(path, "200")).status).toBe(403);
      for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD"])
        expect((await request(path, "100", method)).status).toBe(405);
    }
    expect((await request("/api/conversations/private")).status).toBe(404);
    expect((await request("/files/attached")).status).toBe(404);
    expect((await request("/api/conversations/private", "100", "DELETE")).status).toBe(404);
    expect((await request("/api/conversations/private/regenerate", "100", "POST")).status).toBe(
      404,
    );
    expect((await request("/api/conversations/private/stop", "100", "POST")).status).toBe(404);
    const form = new FormData();
    form.set("conversationId", "private");
    form.set("content", "impersonation");
    expect((await request("/api/chat", "100", "POST", form)).status).toBe(404);
    expect((await request("/api/admin/settings")).status).toBe(404);
    expect((await request("/api/admin/files/document")).status).toBe(404);
    const listResponse = await request("/api/admin/conversations");
    expect(listResponse.headers.get("cache-control")).toBe("no-store");
    const list = (await listResponse.json()) as AdminConversationPage;
    expect(list.conversations.map((conversation) => conversation.id)).toEqual([
      "temporary",
      "private",
      "own",
    ]);
    expect(list.hasMore).toBe(false);
    expect((await request("/api/admin/conversations/temporary")).status).toBe(200);
    const detail = (await (
      await request("/api/admin/conversations/private")
    ).json()) as MessagePage;
    expect(detail.messages.map((message) => message.content)).toEqual([
      "private body",
      "assistant body",
      "",
      "認証情報は表示しません",
    ]);
    expect(detail.messages.flatMap((message) => message.files.map((file) => file.id))).toEqual([
      "attached",
      "fake",
      "generated",
    ]);
    expect(JSON.stringify(detail)).not.toMatch(
      /hidden|SECRET-CODE|example.com|document|attachmentContext|activities/,
    );
    expect((await request("/api/admin/conversations/missing")).status).toBe(404);
    expect((await request("/api/admin/conversations/private?before=missing")).status).toBe(400);
    expect((await request("/api/admin/conversations?before=%27")).status).toBe(400);
    for (const fileId of ["document", "unattached", "missing", "fake"])
      expect((await request(`/api/admin/conversations/private/images/${fileId}`)).status).toBe(404);
    expect((await request("/api/admin/conversations/own/images/attached")).status).toBe(404);
    for (const fileId of ["attached", "generated"]) {
      for (const suffix of ["", "?preview"]) {
        const response = await request(
          `/api/admin/conversations/private/images/${fileId}${suffix}`,
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.get("content-type")).toBe(suffix ? "image/webp" : "image/png");
        expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
      }
    }
    expect(db.serialize()).toEqual(before);
    const auditPath = join(directory, "admin-audit.jsonl");
    expect(statSync(auditPath).mode & 0o777).toBe(0o600);
    const auditText = readFileSync(auditPath, "utf8");
    expect(auditText).not.toMatch(/private body|private title|hidden|SECRET-CODE/);
    const records = auditText
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(records).toHaveLength(9);
    expect(
      records.every(
        (record) => record.viewer_id === "100" && !Number.isNaN(Date.parse(record.timestamp)),
      ),
    ).toBe(true);
    expect(
      records.find(
        (record) => record.action === "conversation" && record.conversation_id === "private",
      ).user_id,
    ).toBe("200");
    expect(
      records.filter((record) => record.action === "image").map((record) => record.file_id),
    ).toEqual(["attached", "attached", "generated", "generated"]);
    for (const record of records)
      expect(Object.keys(record).sort()).toEqual(
        [
          "action",
          "conversation_id",
          ...(record.file_id ? ["file_id"] : []),
          "timestamp",
          "user_id",
          "viewer_id",
        ].sort(),
      );
    rmSync(auditPath);
    mkdirSync(auditPath);
    for (const path of [
      "/api/admin/conversations",
      "/api/admin/conversations/private",
      "/api/admin/conversations/private/images/attached",
    ])
      expect((await request(path)).status).toBe(500);
  } finally {
    await dispose();
  }
}, 30_000);

test("管理者一覧と本文をページングしても会話・メッセージを欠落させない", async () => {
  const { db, request, dispose } = await fixture();
  try {
    for (let index = 0; index < 52; index++) {
      db.query(
        "INSERT INTO conversations (id,user_id,title,created_at,updated_at) VALUES (?, '200', 'page', '2026', '2026')",
      ).run(`page-${index.toString().padStart(2, "0")}`);
      db.query(
        "INSERT INTO conversation_entries VALUES (?, 'private', NULL, ?, 'user_message', ?, '2026-01-01')",
      ).run(
        `page-message-${index}`,
        index + 5,
        JSON.stringify({ role: "user", content: [{ type: "text", text: `body ${index}` }] }),
      );
    }
    const first = (await (
      await request("/api/admin/conversations")
    ).json()) as AdminConversationPage;
    expect(first.conversations).toHaveLength(50);
    expect(first.hasMore).toBe(true);
    const second = (await (
      await request(`/api/admin/conversations?before=${first.conversations.at(-1)!.id}`)
    ).json()) as AdminConversationPage;
    expect(second.conversations).toHaveLength(5);
    expect(second.hasMore).toBe(false);
    expect(
      new Set(
        [...first.conversations, ...second.conversations].map((conversation) => conversation.id),
      ).size,
    ).toBe(55);
    const latest = (await (
      await request("/api/admin/conversations/private")
    ).json()) as MessagePage;
    expect(latest.messages).toHaveLength(15);
    expect(latest.hasMore).toBe(true);
    const messageIds = latest.messages.map((message) => message.id);
    let page = latest;
    while (page.hasMore) {
      page = (await (
        await request(`/api/admin/conversations/private?before=${page.messages[0].id}`)
      ).json()) as MessagePage;
      messageIds.push(...page.messages.map((message) => message.id));
    }
    expect(messageIds).toHaveLength(56);
    expect(new Set(messageIds).size).toBe(56);
  } finally {
    await dispose();
  }
}, 30_000);

test("管理者未設定は無効、権限のないセッションからはモードを利用できない", async () => {
  const { request, dispose } = await fixture("");
  try {
    expect((await (await request("/api/bootstrap")).json()).is_admin).toBeUndefined();
    expect((await request("/api/admin/conversations")).status).toBe(403);
    expect((await request("/api/admin/conversations", "invalid")).status).toBe(401);
  } finally {
    await dispose();
  }
}, 30_000);
