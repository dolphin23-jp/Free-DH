# AGENTS.md — 開発規約(コーディングエージェント向け)

このリポジトリは、ブラウザで動くカバン構築×オートバトルのローグライトゲーム(ソロ開発)。
**実装前に必ず以下のドキュメントを読むこと。**

## ドキュメントの優先順位(Source of Truth)

1. `docs/COMBAT_SPEC.md` — **戦闘ルールの唯一の正**。実装との食い違いは実装のバグ
2. `src/data/*.json` — 全バランス数値の唯一の置き場(items / enemies / recipes / config)
3. `docs/DESIGN.md` / `docs/ITEMS.md` / `docs/ENEMIES.md` — 設計意図・背景
4. `docs/TASKS.md` — タスク定義と受け入れ条件

仕様に曖昧さや矛盾を見つけた場合: **勝手に解釈して実装しないこと。** `docs/SPEC_TODO.md` に「箇所・問題・暫定判断」を追記し、暫定判断が最小影響になるよう実装する。

## 技術スタック

- Vite + React 18 + TypeScript(strict)/ Zustand / dnd-kit / Framer Motion / Howler
- テスト: Vitest / Lint: ESLint + Prettier
- Node 20+ / pnpm
- デプロイ: Vercel(静的SPA)。サーバーは v1 では存在しない

```
pnpm install
pnpm dev          # 開発サーバー
pnpm test         # Vitest(エンジン変更時は必須)
pnpm lint
pnpm build        # Vercel用ビルド
pnpm sim -- --build=standard-a1 --enemy=EN_A1_01 --n=1000   # ヘッドレスシミュレータ
```

## 絶対規則(違反はレビュー却下)

1. **決定論**: `Math.random` 全面禁止。乱数は `src/engine/rng.ts` の seed付きmulberry32 のみ。シードのfork規則は COMBAT_SPEC §2
2. **データ駆動**: バランス数値(ダメージ・HP・確率・価格 等)をコードにハードコードしない。必ず `src/data/*.json` から読む。数値調整のPRは JSON のみの差分になること
3. **エンジンの純粋性**: `src/engine/` は React / DOM / Zustand / window を import しない。入力(build, enemyId, seed)→出力(結果+イベントログ)の純関数群として実装する。UIはイベントログを再生するだけで、ルール計算を二重実装しない
4. **ゴールデンテスト**: エンジンに変更を加えるPRは `pnpm test` のゴールデンテスト(固定シードのイベントログハッシュ)を通すこと。意図的にログが変わる場合は、スナップショット更新の理由をPR本文に明記
5. **仕様の改変禁止**: ゲームルール・数値の「改善提案」を実装に混ぜない。気づきは `docs/SPEC_TODO.md` へ
6. 新しい依存パッケージの追加は、PR本文に必要理由を1行書く。UIコンポーネントライブラリの導入は不可(素のReact+CSSで作る)

## リポジトリ構成

```
/docs                 # 設計書類(本規約が参照)
/src/engine           # 戦闘エンジン(純TS・UI非依存)
/src/data             # items.json / enemies.json / recipes.json / config.json
/src/store            # Zustand(周回状態・メタ進行・セーブ)
/src/ui               # Reactコンポーネント
/src/sim              # ヘッドレスシミュレータCLI(バランス検証)
/tests                # Vitest(engine単体・ゴールデン・データ整合)
```

## Definition of Done(全タスク共通)

- `pnpm test` / `pnpm lint` / `pnpm build` が全て通る
- TypeScript strict でエラーなし。`any` の新規使用なし
- エンジン変更ならテスト追加あり。データ変更なら `tests/data.test.ts`(整合性チェック)が通る
- TASKS.md 該当タスクの受け入れ条件を全て満たす
- 挙動が変わる変更は該当ドキュメントも更新する

## やらないこと

- ランキング・オンライン機能・アカウント(v1スコープ外)
- localStorage 以外の永続化
- エンジン内での日時取得・I/O・グローバル状態
