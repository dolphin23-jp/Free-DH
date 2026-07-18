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
pnpm sim          # 標準100回/対戦のヘッドレス・バランスレポート
```

シミュレータの反復回数は `pnpm sim -- --runs 500`、機械可読出力は `pnpm sim -- --json` で指定できます。目標帯から外れた結果は警告として表示され、コマンド自体は失敗しません。

ゲーム仕様は `docs/`、バランスデータは `src/data/` を参照してください。実装時の優先順位と規約は `AGENTS.md` に従います。

## CI / デプロイ

Pull RequestではGitHub Actionsが `test`、`lint`、`build` を実行します。静的SPAとしてVercelへデプロイできます。
