# ai-chat

ChatGPT風のWebチャットです。個人チャットに加え、招待制の共有プロジェクトで複数ユーザーが同じ会話へ参加できます。pi CLIを経由せず、`@earendil-works/pi-ai`からChatGPT Plus/ProのCodex OAuth認証を直接使用します。

## 構成

- Next.js 16 (App Router) / React 19 / shadcn/ui / Tailwind CSS 4 / Motion
- Bun HTTP API / Drizzle ORM + SQLite
- Discord OAuth2、DiscordユーザーID許可リスト
- オーナー1人と招待参加者によるプロジェクト共有、共同チャット、ユーザー別未読管理
- Codexサブスク認証による会話（モデルは`CODEX_MODEL`で固定）
- ユーザーの依頼内容に応じた自律Web検索（Exa MCP、APIキー不要）
- オンデマンド読込するユーザースキルと、組み込み`imagegen`スキル
- Codex Images APIによる画像生成・画像編集
- 標準チャット・プロジェクト別システムプロンプト、作成者専用の一時チャット
- ユーザー別画像保存・共有プロジェクト内での画像閲覧・Web検索
- `/login`、`/` の2ページ（設定はチャット内のボトムシート）

UIコンポーネントは `src/components/ui` のshadcn/uiに統一しています。配色はshadcnのトークン（`--background`、`--card`、`--primary` など）へ既存パレットを割り当てているため、見た目は従来のままです。

スキルは名前と説明だけを通常のsystem promptへ載せ、本文は必要時に`load_skill`で読み込みます。ユーザースキルはDiscordユーザーIDごとに分離し、組み込み`imagegen`は画像生成・編集前に必ず読み込みます。`imagegen`の設計原則は[awesome-gpt-image-2](https://github.com/freestylefly/awesome-gpt-image-2)を参考にしていますが、事例集やstyle libraryは同梱しません。Web検索は `pi-web-access` と同じ公開 Exa MCPを使用します。

個人・プロジェクトのスキルは、設定のskills.sh一覧から詳細を開き、`SKILL.md`本文と同梱スクリプト等を確認してから追加します。本文はMarkdown/HTMLを実行・描画せず、生テキストで表示します。詳細取得時にGitHubの既定ブランチをコミットSHAへ確定し、追加時もサーバーが同じSHAのファイルを再取得して保存します。導入済み詳細は保存済みの指示とコミットSHAを表示し、上流の最新内容には置き換えません。SHAを記録していない過去のスキルは`null（不明）`です。

## セットアップ

1. Discord Developer PortalでApplicationを作成し、OAuth2 Redirect URIに以下を登録します。

   ```text
   https://chat.fumiya.dev/api/auth/callback/discord
   ```

2. 環境変数を作成します。

   ```bash
   cp .env.example .env
   # DISCORD_CLIENT_ID、DISCORD_CLIENT_SECRET、ALLOWED_DISCORD_USER_IDS、CODEX_MODELを設定
   ```

3. 起動します。

   ```bash
   docker compose up -d --build
   ```

4. `https://chat.fumiya.dev/login` からDiscordでログインします。Codex認証が未設定または期限切れの場合、最初のメッセージへの返答として認証URLとdevice codeが表示されます。リンク先で認証後、メッセージを再送してください。

ローカル開発:

```bash
bun install
bun run dev
# http://localhost:3000
```

ローカル開発時のDiscord Redirect URIは `http://localhost:3000/api/auth/callback/discord` です。Next.jsが画面を3000番で配信し、`/api`・`/files`・`/logout` だけrewritesで3001番のBunサーバーへ転送します。WebSocket (`/api/socket`) はrewritesを通せないため、開発時のみ `NEXT_PUBLIC_API_ORIGIN` を使って3001番へ直接接続します。

## サーバー構成

本番は1コンテナで2プロセスを動かします。

```text
:3000 Bunサーバー ─┬─ /api/*、/files/*、/logout、/api/socket (WebSocket)
                   └─ それ以外 → プロキシ → :3002 next start
```

Bunサーバーが前段に立つことで、セッションcookieの検証、未ログイン時の `/login` へのリダイレクト、`/chat/:id` の所有者チェックを従来どおりページ配信前に行えます。WebSocketとCodex生成処理はBun側に残しています。CSPのnonceは `src/proxy.ts` がリクエストごとに発行します。

## データ

`data/` を永続化します。

```text
data/
├── auth.json                  # Codex OAuth認証（0600）
├── chat.sqlite               # ユーザー、履歴、共有関係、プロジェクト、スキル、画像索引
└── users/<discord-user-id>/
    └── files/
        ├── YYYY-MM-DD/        # アップロード
        └── generated/         # 生成画像
```

画像は所有者本人、または画像を含む共有チャットの参加者だけが `/files/:id` から取得できます。アップロード上限は既定で1リクエスト合計20MBです。

DB migrationはAPI起動時に自動適用されます。スキーマ変更時は `src/api/schema.ts` を編集し、migrationを生成します。

```bash
bun run db:generate
```

デプロイ前はアプリを停止し、SQLite本体とWALをまとめて退避します。

```bash
docker compose down
backup="data/backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup"
cp -a data/chat.sqlite* "$backup"/
docker compose up -d
```

## 公開

Composeの `tunnel` サービスが `gateway.fumiya.dev:2222` へSSH接続し、`chat:80` をアプリの `chat:3000` へリバースフォワードします。ホストの `~/.ssh/id_ed25519` と、StrictHostKeyChecking用の `known_hosts` が必要です。TLS終端はgateway側で行います。

## 注意

画像生成は `pi-discord-bot` と同じChatGPT Codex内部Images APIを使用します。OpenAIの公開APIではないため、サービス側の仕様変更で追従が必要になる可能性があります。
