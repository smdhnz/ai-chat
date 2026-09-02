# imagegen

画像生成・編集では、ユーザーの現在の依頼、画像に関係するプロジェクト指示、参照画像の維持条件を、`generate_image` が受け取る短い生成仕様へ変換する。

## 優先順位

1. ユーザーの現在の明示的制約
2. 画像に関係するプロジェクト指示
3. 参照画像から維持すべき内容
4. このスキルの用途別デフォルト

画像に関係するプロジェクト指示を省略・弱化・反転しない。このスキルはplatform指示、現在の依頼、認証、所有権、tool制限を上書きしない。

## 基本方針

- 具体的な依頼は正規化だけ行い、未要求の人物、物体、ブランド、文言、物語を追加しない。
- 曖昧な依頼だけ、成功に必要な最小限を具体化する。
- `cinematic`、`ultra-detailed`、`vibrant`、`majestic`、`award-winning` などを自動追加しない。
- 抽象的な品質語だけに頼らず、必要な光、素材、構図を観察可能な表現で記述する。
- negative promptは、起きやすく重要な失敗だけに限定する。
- 1回目の生成・編集が成功したら、主観的な改善や軽微な不完全さを理由に再実行せず、その結果を返す。
- 再実行は、出力を確認でき、ユーザーの明示要件を満たせず利用不能にする具体的で重大な欠陥がある場合だけ行う。2回目が成功したらそれを最終結果とする。

## 用途

依頼を次のいずれかとして整理する。

- `natural-photo`
- `product`
- `ui-poster`
- `diagram-infographic`
- `illustration-concept`
- `edit`

分類名を画像内の文字として描画させない。

## Prompt構造

必要な行だけを使い、空欄や無関係な行は省く。JSONを既定形式にしない。

```text
Use case: <分類>
Primary request: <主要求>
Scene/subject: <対象と環境>
Composition: <画角、配置、余白>
Light/color/materials: <必要な具体条件>
Text (verbatim): "<正確な文字列>"
Preserve: <編集時に維持する内容>
Constraints: <必須・禁止条件>
```

## 自然写真

`natural-photo` の場合だけ、依頼に合う範囲で以下を使う。

- 現実的な撮影位置、視点高さ、レンズ、被写界深度
- 光源方向と一貫した影
- RAW未補正に近い色、抑えた彩度、局所的な露出差
- 生活感、摩耗、汚れ、霞、微細な非対称性
- 偶発的で少し不完全なフレーミング
- 必要な場合だけセンサーまたはフィルム粒子

未要求なら、完璧な左右対称、鏡のような反射、均一すぎる表面、過度なHDR・彩度・輪郭強調、マゼンタ／ティールの色調、巨大化したランドマーク、観光ポスター風の理想化、CGI・3D render・beauty retouchingを避ける。

広告、コンセプトアート、強い演出が明示された場合、この規則を機械的に適用しない。

## 編集

- 編集対象のfile IDだけを `inputFileIds` に渡す。
- `Change` と `Preserve` を分け、「変更する部分以外は維持」を明記する。
- 人物同一性、文字、ロゴ、構図など重要な不変条件を繰り返す。
- 対象画像が曖昧な場合だけ確認する。

仕様を組み立てたら `generate_image` を実行する。

設計原則の参考:

- https://github.com/freestylefly/awesome-gpt-image-2
- https://github.com/freestylefly/awesome-gpt-image-2/blob/main/docs/templates.md
- https://github.com/freestylefly/awesome-gpt-image-2/blob/main/agents/skills/gpt-image-2-style-library/SKILL.md
