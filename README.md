# Free-DH

ブラウザで動く、カバン構築×オートバトルのローグライトゲームです。

## 必要環境

- Node.js 20以上
- pnpm 10.13.1

## セットアップ

```bash
corepack enable
pnpm install
```

## 開発コマンド

```bash
pnpm dev          # 開発サーバー
pnpm test         # Vitest
pnpm lint         # ESLint
pnpm format:check # Prettierチェック
pnpm build        # TypeScript検査 + Viteビルド
```

ゲーム仕様は `docs/`、バランスデータは `src/data/` を参照してください。実装時の優先順位と規約は `AGENTS.md` に従います。

## CI / デプロイ

Pull RequestではGitHub Actionsが `test`、`lint`、`build` を実行します。静的SPAとしてVercelへデプロイできます。
