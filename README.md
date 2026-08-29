# ai-chat

ChatGPT風のプライベートWebチャットです。pi CLIを経由せず、`@earendil-works/pi-ai`からChatGPT Plus/ProのCodex OAuth認証を直接使用します。

## 構成

- React 19 / Vite / Tailwind CSS 4 / Motion
- Bun HTTP API / SQLite
- Discord OAuth2、DiscordユーザーID許可リスト
- Codexサブスク認証による会話（一般設定でモデルとThinkingを選択、既定は`gpt-5.6-sol` / `low`）
- ユーザーの依頼内容に応じた自律Web検索（Exa MCP、APIキー不要）
- Codex Images APIによる画像生成・画像編集
- 会話履歴、プロジェクト別システムプロンプト、ユーザー追加スキル
- ユーザー別ファイル保存・Web閲覧
- `/login`、`/`、`/settings` の3ページ

`skills/imagegen` のみ `../pi-discord-bot/.pi/skills/imagegen` から移植しています。その他のpiスキルやコーディングエージェント用プロンプトは読み込みません。Web検索は `pi-web-access` と同じ公開 Exa MCP を利用し、ターンプランナーが最新情報・外部根拠・URL調査の必要性を判断した場合だけ実行します。

## セットアップ

1. Discord Developer PortalでApplicationを作成し、OAuth2 Redirect URIに以下を登録します。

   ```text
   https://chat.fumiya.dev/api/auth/callback/discord
   ```

2. 環境変数を作成します。

   ```bash
   cp .env.example .env
   # DISCORD_CLIENT_ID、DISCORD_CLIENT_SECRET、ALLOWED_DISCORD_USER_IDSを設定
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

ローカル開発時のDiscord Redirect URIは `http://localhost:3000/api/auth/callback/discord` です。Viteが画面を3000番で配信し、APIリクエストだけ3001番へ転送します。

## データ

`data/` を永続化します。

```text
data/
├── auth.json                  # Codex OAuth認証（0600）
├── chat.sqlite               # ユーザー、履歴、プロジェクト、スキル、ファイル索引
└── users/<discord-user-id>/
    └── files/
        ├── YYYY-MM-DD/        # アップロード
        └── generated/         # 生成画像
```

ファイルは認証済み本人の `/files/:id` からのみ取得できます。アップロード上限は既定で1リクエスト合計20MBです。

## 公開

Composeの `tunnel` サービスが `gateway.fumiya.dev:2222` へSSH接続し、`chat:80` をアプリの `chat:3000` へリバースフォワードします。ホストの `~/.ssh/id_ed25519` と、StrictHostKeyChecking用の `known_hosts` が必要です。TLS終端はgateway側で行います。

## 注意

画像生成は `pi-discord-bot` と同じChatGPT Codex内部Images APIを使用します。OpenAIの公開APIではないため、サービス側の仕様変更で追従が必要になる可能性があります。
