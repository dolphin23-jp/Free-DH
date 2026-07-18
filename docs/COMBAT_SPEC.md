# COMBAT_SPEC — 戦闘解決の厳密仕様 v1.0

> **本書がゲームルールの単一の真実(Source of Truth)。** 実装が本書と食い違う場合は実装のバグ。
> 曖昧な点を発見したら、実装者(エージェント)は勝手に解釈せず `docs/SPEC_TODO.md` に記録して作業を続けること。

---

## 1. 実体モデル

- **戦闘 = Player vs Enemy** の1対1。双方とも `HP / 状態異常 / ブロック / 実体リスト` を持つ
- Player の実体 = カバンに配置された**アイテムインスタンス**(位置・回転・アフィックス・封印フラグを持つ)
- Enemy の実体 = enemies.json の `abilities`(CD付き行動)と `traits`(パッシブ)
- スタミナは **Player のみ** の資源。敵は消費しない

## 2. 乱数(決定論の根幹)

- PRNG: **mulberry32**。`Math.random` の使用は全面禁止
- シード体系(fork = `hash(親シード文字列 + ":" + ラベル)`):
  - `runSeed`(周回開始時に生成 or 指定)
  - `runSeed → "enemyOrder:{area}"` エリア内の敵順シャッフル
  - `runSeed → "drops:{battleIndex}"` ドロップのレア度・種類・アフィックス
  - `runSeed → "shop:{battleIndex}:{rerollCount}"` ショップ陳列
  - `runSeed → "battle:{battleIndex}"` 戦闘内乱数(会心・封印対象)
- **消費順序**: 乱数は「必要になった瞬間に、本書のパイプライン順で」消費する。順序変更はゴールデンテスト差分として検出する
- 戦闘内で乱数を使うのは次の2点のみ: ①封印対象の選択(戦闘開始時) ②会心判定(ダメージ発動ごと)。**それ以外の戦闘内解決はすべて決定的**

## 3. Tickパイプライン

- 1 tick = **0.1秒**。戦闘は tick 0 から開始
- 各tickの処理順(この順番は不変):

```
1. 時刻更新 t += 0.1
2. 状態異常ダメージ(tが整数秒ちょうどの時のみ): Player→Enemy の順に適用
3. サドンデス判定(t >= 60 かつ 整数秒): 双方に Trueダメージ(値 = t - 60 + 1)。Enemy→Playerの順に適用
4. Player スタミナ回復 +0.1×(基礎1.0 + 修正)。上限10
5. 全実体のCDを 0.1 減算(下限0)
6. Player アイテム発動フェーズ(§4)
7. Enemy 行動発動フェーズ(§4)
8. 死亡・終了判定は各ダメージ適用の直後に随時行う(§9)
```

## 4. 発動順序

- **グリッド順 = 行優先(上の行から、左から右)**。アイテムの「位置」は占有マスのうち最も左上のマス
- 発動条件: `CD == 0` かつ `必要スタミナ <= 現在スタミナ` かつ 未封印
- CD 0 でスタミナ不足のアイテムは **ready 状態で待機**(CDは0のまま)。スタミナが回復したtickの発動フェーズで、グリッド順に発動する
  → **配置位置 = スタミナの優先順位** という隠れた深み(仕様であり、ヘルプに明記する)
- 同一tickに複数が発動可能なら、グリッド順にすべて発動する(1tick1発動の制限はない)
- 発動時: スタミナ消費 → CDリセット(修正後CD、下限0.3秒) → 効果解決(§5)
- Enemy は abilities の**配列順**に同じ規則で処理(スタミナ条件なし)

## 5. ダメージ解決パイプライン

1発のダメージは以下の順で確定する:

```
base
→ (a) 加算修正: 隣接 flatDamage、アフィックス等をすべて加算
→ (b) 乗算修正: 全ての「ダメージ+X%」を合算して1回だけ掛ける
      例: 狂戦士+30% と 悪魔の契約書+50% → ×1.8(×1.3×1.5 ではない)
→ (c) 会心判定: 基礎5% + 修正。成立で ×2.0(武器固有倍率があれば上書き。例: 戦斧2.5)
→ (d) 特効倍率: execute(処刑斧)、undeadSlayer(聖剣) 等のキーワード倍率
→ (e) 端数処理: 小数第1位まで保持して適用(表示は四捨五入)
→ (f) 適用: pierce でなければ相手のブロックから減算 → 残りをHPへ
→ (g) 命中後処理: onHitトリガー(§7)、被弾側の onDamagedトリガー
```

- **CD減少の合算**: すべて加算合計し、上限 **-60%**。修正後CDの下限 **0.3秒**
- スタミナ消費減少: 加算合計、下限 0
- 回復は最大HPを超えない。最大HP減少で現在HPが超過したら切り詰め

## 6. 状態異常

| 異常 | 付与 | ダメージ | 消滅 |
|---|---|---|---|
| 毒 | スタック加算(上限なし) | 整数秒ごとに スタック数 | **戦闘終了時**(魔王のフェーズ移行では持ち越す) |
| 火傷 | 付与ごとに独立バッチ(各3.0秒で消滅) | 整数秒ごとに 有効スタック合計 | 各バッチ3秒 |
| 鈍化 | 持続時間(重ねがけは時間延長、効果は固定) | — | 時間切れ |

- 鈍化: 対象のCD進行速度 -20%(CD減算が 0.1 → 0.08)
- **状態異常ダメージは Trueダメージ**: ブロック無視。反射・吸血・onHit/onDamagedトリガーを一切発生させない
- cleanseSelf(聖水): 自分の毒スタックと火傷バッチを全消去

## 7. トリガー規則

- 種類: `battleStart / onHit(自分の攻撃が命中) / onDamaged(HPまたはブロックにダメージを受けた) / onBlocked(ブロックで全額吸収) / onKill / hpBelow(閾値を下回った瞬間) / battleWin`
- **連鎖深度は1**: トリガーから発生したダメージ・効果は、新たな onHit / onDamaged を発生させない
  - 反射ダメージは反射されない。吸血は反射に反応しない
- battleStart の解決順: Player のアイテムをグリッド順 → Enemy の traits を配列順
  - ただし **封印(呪術師・呪いの偶像)は最優先**で全 battleStart より前に解決する(封印されたアイテムの battleStart は不発)
- hpBelow は戦闘中1回だけ判定(下回った最初の瞬間)

## 8. スペシャルキーワード表(一意効果の厳密定義)

| キーワード | 保持者 | 挙動 |
|---|---|---|
| openingShot | W04/W09/F12/T07 | battleStart 時に CD を 0 にする(=最初の発動フェーズで即発動。スタミナ条件は通常通り) |
| execute | W11 | 対象の現在HPが最大HPの50%以下なら ×1.5(パイプライン(d)) |
| pierce | W12/F15 | ブロックを無視してHPに直撃 |
| battleScalingDamage | W14 | 自身の命中ごとに、その戦闘中 base +1 |
| runScalingDamage | E07 | 自身の命中ごとに、**周回中永続** base +0.2(runステートに保存) |
| poisonFinisher | W15 | 命中時、対象の毒スタック×3 を追加ダメージ(True ではない通常加算、(a)段階) |
| guardianHeal | T12 | hpBelow30% で HP40 回復(1戦闘1回) |
| sealAdjacent | C12 | 配置確定時、隣接の 上→左→右→下 の優先順で最初のアイテムを封印(戦闘外でも表示上封印)。封印対象が消えたら次の優先へ |
| duplicateAdjacent | C13 | battleStart: 隣接アイテムのうち最高レア(同率はグリッド順先頭)を複製。複製は元と同じ確定ステータス・独立CDを持つ仮想実体で、発動順は元の直後 |
| readyAllCooldowns | E08 | battleStart: Player 全アイテムの CD を 0 にする |
| runMaxHpOnKill | C11/F17 | 撃破ごとに最大HP+3(F17は+5)。**周回中永続**(装備を外しても失われない) |
| dropLuck | F10 | ドロップのレア度表で 橙+1pp(白から移動)。カバン内にある間のみ有効 |
| healPercentOnWin | F18 | battleWin: 最大HPの25%回復 |
| blockRegen | 敵trait | 毎整数秒、ブロック+X(上限cap)。※Playerのブロック獲得はアイテムCD由来のみ |
| revive | スケルトン | HP0 になった瞬間、1回だけ HP45 で継続(死亡判定を打ち消す) |
| lifesteal | ヴァンパイア | 与えたHPダメージと同量を自己回復。**火傷状態の間は無効** |
| goldSteal + flee | 野盗 | 命中ごとに Player の所持Gから4G奪う(下限0)。**自身の命中8回目の直後に離脱**: 戦闘は勝利扱い・通常ドロップあり・奪われたGは消失。撃破すれば奪った全額+8G |
| openingFrenzy | 狼 | t < 3.0 の間、与ダメージ ×2 |
| enrage | ゴブリンキング/魔王P2 | 6秒ごと(t=6,12,…)に自身の攻撃 +X(累積) |
| staminaDrain | リッチ | Player のスタミナ回復 -50%(基礎1.0→0.5。装備修正はその後加算) |
| phaseTransition | 魔王 | P1のHP≤0で死亡せず P2 へ即移行(同tick)。PlayerのバフとEnemyへの毒・火傷は持ち越し。ブロックはEnemy側リセット、Player側維持。戦闘時計は継続 |

## 9. 戦闘終了判定

- 各ダメージ適用の直後に判定。`Enemy HP <= 0`(revive/phase考慮後)→ **勝利**。`Player HP <= 0` → **敗北 = 周回終了**
- 同一処理内で両者が0以下になり得るのはサドンデスのみで、**Enemy→Player の順に適用**するため Player 有利(敵が先に死ねば勝利)
- 野盗の flee は「勝利(部分報酬)」として終了
- 勝利時処理の順: battleWin トリガー(グリッド順) → ゴールド獲得 → ドロップ抽選 → 状態異常・ブロック・戦闘内スケールをリセット(周回スケールは維持) → HPはそのまま持ち越し

## 10. 周回・経済の設定値(config.json に転記する)

### 10.1 プレイヤー基礎値
`初期HP100 / スタミナ上限10・回復1.0/s / ブロック上限30 / 会心基礎5%・倍率2.0 / CD下限0.3s / CD減上限60% / カバン初期4×3 / ストレージ8枠 / 初期ゴールド15G`

### 10.2 ドロップ

- 通常勝利: 2枠 / ボス: 3枠 + カバン拡張キット(+1列 or +1行 選択。4×3→5×3→5×4→6×4) / 強化個体: +1枠
- 最終拡張 6×4→6×5 はショップ購入のみ(30G)
- レア度テーブル(%)— 深淵Lv d につき: 橙+0.3d, 紫+0.7d, 青+1.0d を白から移す:

| エリア | 白 | 緑 | 青 | 紫 | 橙 |
|---|---|---|---|---|---|
| 1(森) | 50 | 30 | 14 | 5 | 1 |
| 2(遺跡) | 38 | 33 | 19 | 8 | 2 |
| 3(魔城) | 28 | 33 | 24 | 12 | 3 |

- **天井(非公開)**: 橙を引かずに30戦経過で、以降1戦ごとに橙+1pp(白から)。橙入手でリセット。カウンタは周回をまたいで保存
- 種類抽選: レア度決定後、そのレア度の解放済み・非fusionOnlyアイテムから weight 比例で抽選
- アフィックス: 青=1個 / 紫=1個(50%で2個) / 橙=2個。プールは items.json `affixPool`。同一アフィックス重複なし。target 適合のみ

### 10.3 ショップ

- 陳列6枠(レア度テーブルは同上)。リロール価格: 5→7→10→14→19G(ショップごとにリセット)
- 価格: 白4 / 緑8 / 青15 / 紫28 / 橙50。売却は購入価格の50%(E02古銭のみ15G)
- 回復サービス: 20GでHP20(各ショップ1回)
- 呪いの宝箱: 出現率10%。50Gで「紫以上確定+呪いアフィックス(最大HP-10)」
- ギャンブル商人: 出現率10%。30Gでレア度完全等確率(20%×5)の1枠

### 10.4 ボス撃破後の二択
`最大HPの40%回復` or `追加ドロップ2枠`(拡張キットとは別)

### 10.5 魂片とアンロック

- 獲得 = 到達戦闘数 ×(1 + 0.2×深淵Lv)、クリアボーナス+10(端数切り上げ)
  - 例: 深淵0クリア=25 / 深淵2で10戦目敗北=14
- 価格: 青アイテム15 / 紫30 / 橙60 / クラス(狩人・薬師)各40
- 初期ロック対象は items.json の `unlockCost > 0` の13種
- 深淵Lv: クリアした最高Lv+1 まで選択可(上限10)。敵HP×(1+0.15d)・攻撃×(1+0.10d)。深淵3以上で通常戦1つが強化個体(HP+30%・ドロップ+1)に置換(置換対象は `enemyOrder` ストリームで決定)

## 11. エンジンの出力: イベントログ

`simulate(build, enemyId, seed)` は最終結果に加えて**イベント配列**を返す。UIはこれを再生するだけ(UI側でルール計算をしない):

```ts
type CombatEvent =
  | { t: number; type: "activate"; side: "player"|"enemy"; sourceId: string }
  | { t: number; type: "damage"; side: Side; amount: number; crit: boolean; blocked: number; kind: "normal"|"status"|"reflect"|"sudden" }
  | { t: number; type: "heal"|"block"|"gold"; side: Side; amount: number; sourceId: string }
  | { t: number; type: "status"; side: Side; status: "poison"|"burn"|"slow"; value: number }
  | { t: number; type: "seal"; itemId: string }
  | { t: number; type: "phase"|"revive"|"flee"|"end"; detail: string };
```

- **ゴールデンテスト** = 固定 build×enemy×seed のイベントログのハッシュを固定。エンジン変更でハッシュが変わる場合、意図的変更である説明をPRに必須記載

## 12. effects語彙(items.json / enemies.json の解釈)

- アクティブ: `damage / block / heal(oncePerBattle可) / applyStatus(poison|burn|slow) / cleanseSelf`
- パッシブ: `maxHp / maxHpMult / damageReduction / critChance / critMultiplier / damageMult(条件付き可: hpBelow50) / allCdMult / staminaRegen / blockCapBonus / sellBonus / dropLuck`
- 隣接(adjacency): `target: weapon|shield|bottle|all` × `critChance / cdMult / staminaMult / flatDamage / blockFlat / onHitPoison / onHitHeal / onHitGold / effectMult`(隣接=上下左右。C14賢者の石のみ周囲8マス `range8: true`)
- 隣接・パッシブの効果は**戦闘開始時にスナップショット**して戦闘中固定(封印・複製の解決後に計算)
- トリガー付き効果: `trigger: battleStart|onHit|onKill|onDamaged|onBlocked|battleWin|hpBelow` + 上記効果および `reflect`(攻撃者への反撃)
- 一意挙動は `special: "キーワード"`(§8の表が定義)
