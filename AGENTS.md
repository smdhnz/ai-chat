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

- UIはネイティブHTML要素・React・Tailwind CSSで実装し、UIコンポーネントライブラリは追加しない。
- スマートフォン向け表示のみを実装し、PC向けレスポンシブ分岐は追加しない。
- ネイティブの `title` 属性ではなく、画面内テキストまたは `aria-label` で操作を説明する。
- `window.confirm`・`alert`・`prompt`は使用しない。
- ダイアログはアクセシブルなネイティブ`dialog`を使用し、入力には必ずラベルを関連付ける。
