# 開発ルール

## 品質ゲート

- 変更後は必ず `bun run check` を実行する。
- Prettier、TypeScript、ESLint、テスト、Next.js buildのerrorとwarningを0件にする。
- ESLintのwarningは `--max-warnings=0` で失敗として扱う。
- error・warningを無効化コメントや設定緩和で隠さず、原因を修正する。
- 検証を実行できない場合は、理由と未確認項目を明記する。

## フォーマット

- TypeScript、TSX、JavaScript、JSON、CSS、Markdown、YAML、HTMLはPrettierに従う。
- 手動整形ではなく `bun run format` を使用する。
- `.env`、生成物、依存関係、バイナリ、移植元の実行スクリプトは整形対象外とする。

## 実装

- pi CLIは使用しない。会話は`@earendil-works/pi-ai`を直接使用する。
- 移植するpiスキルは`skills/imagegen`のみに限定する。
- 認証・ファイル・会話データは必ずDiscordユーザーIDで分離する。
- 開発時のブラウザ入口は3000番、内部APIは3001番を使用する。
- `bun run dev`はユーザーが実行する。エージェントは起動しない。

## UI

- UIコンポーネントはshadcn/ui（style: new-york、baseColor: neutral）に統一する。
- 追加は `bunx --bun shadcn@latest add <name>` を使う。`src/components/ui/`を手書きで新設しない。
- ネイティブの `title` 属性ではなく `Tooltip` を使う。`window.confirm`・`alert`・`prompt`は使用しない。
- 空状態は `Empty`、ローディングは `Spinner`、フォーム行は `Field` 系で表現する。
- `src/components/ui/`配下は以下の6ファイルに独自拡張を入れている。`shadcn add`で上書きすると壊れるため、再実行時はプロンプトで必ず**no**を選ぶ。

| ファイル           | 独自拡張                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `button.tsx`       | `icon-xs` / `icon-sm` / `icon-lg` サイズを追加                                           |
| `switch.tsx`       | `size?: "sm" \| "default" \| "lg"` を追加                                                |
| `dialog.tsx`       | `overlayClassName` を追加                                                                |
| `alert-dialog.tsx` | Action・Cancelに `variant` / `size` を透過                                               |
| `sidebar.tsx`      | `openMobile` / `onOpenMobileChange` を制御可能propに変更                                 |
| `scroll-area.tsx`  | `viewportRef` / `viewportProps` / `scrollBars` を追加、viewportの`display:table`を無効化 |
