# RUN_STATE — 周回ステートマシン

T12で実装した周回状態の境界と遷移を定義する。戦闘ルール自体は `COMBAT_SPEC.md`、数値は `src/data/config.json` を正とする。

## 状態遷移

```text
idle
  └─ startRun(seed) → preBattle
                         └─ beginBattle() → battle
                              ├─ 勝利（戦闘1〜14）→ preBattle（battleIndex + 1）
                              ├─ 勝利（戦闘15）→ result: cleared
                              └─ 敗北 → result: defeated

result
  ├─ startRun(seed) → 新しい周回
  └─ resetRun() → idle
```

`battleIndex` は内部では0始まりで、0〜14を取る。画面上の「第N戦」は `battleIndex + 1` とする。`battlesWon` は勝利済み戦闘数であり、敗北時には増えない。

## 敵順と戦闘シード

- 各エリアの通常敵4体を `fork(runSeed, "enemyOrder:{area}")` の独立ストリームでFisher–Yatesシャッフルする。
- 各エリアの5戦目にはそのエリアのボスを固定する。
- 3エリアを連結し、合計15戦の `enemyOrder` とする。
- 各戦闘の乱数シードは `fork(runSeed, "battle:{battleIndex}")` から導出する。

同じ `runSeed` では敵順と各戦闘シードが完全に一致する。`Math.random` は使用しない。

## 周回中に持ち越す状態

- 現在HP / 最大HP
- 所持G
- カバンの列数・行数と配置アイテム
- ストレージ容量と格納アイテム
- アイテムのアフィックス解決値
- `runScalingDamage` のアイテム別加算値
- 勝利数と現在戦闘index

ブロック、スタミナ、状態異常、戦闘中だけのバフは戦闘状態に属し、周回ストアへは保存しない。

## 戦闘エンジンとの境界

`selectCurrentCombatSetup` は現在の周回状態から `CombatSetup` を生成する。カバン内アイテムだけをbuildへ変換し、現在HP・最大HP・所持Gと当該戦闘シードを渡す。

戦闘終了後は `battleResolutionFromCombatState` で以下を周回側へ戻し、`completeBattle` へ渡す。

- 勝敗
- 戦闘後HP / 最大HP
- 戦闘後所持G
- 物理アイテムごとの `runDamageBonus`

仮想複製は周回インベントリへ保存しない。

## スナップショットとリロード

`exportRunSnapshot` はactionを含まないJSON直列化可能なversion 1スナップショットを返す。`createRunStore(snapshot)` または `loadSnapshot(snapshot)` で復元する。

復元時にはversion、HP、戦闘index、敵順とrunSeedの一致、インベントリの重複instance ID、未知item ID、ストレージ上限を検証する。

T12では永続化先を持たず、メモリ上のスナップショット境界までを実装する。`localStorage`、JSONエクスポート／インポート、セーブ移行はT20で実装する。

## T13との境界

T12はインベントリの所有状態と直列化を担当する。アイテム形状、回転後の占有マス、カバン境界、重なり拒否、ドラッグ操作はT13の責務であり、周回ストアでは二重実装しない。
