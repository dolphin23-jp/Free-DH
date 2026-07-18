import { useEffect, useMemo, useState } from 'react'
import { useStore } from 'zustand'

import { enemies, type RuntimeEnemy } from '../data'
import { prepareAbyssEnemyDefinition, isEliteBattle } from '../engine/abyss'
import { removeTemporaryAffixMaxHp } from '../engine/affixes'
import { getDropLuckPercent } from '../engine/drops'
import { createCombatReplay } from '../engine/replay'
import { codexStore, getEnemyPreview } from '../store/codex'
import { dropProgressStore } from '../store/drop-progress'
import { metaStore } from '../store/meta'
import {
  RUN_BATTLE_COUNT,
  battleResolutionFromCombatState,
  getCurrentEnemyId,
  runStore,
  selectCurrentCombatSetup,
  type BossBenefitChoice,
  type BossExpansionChoice,
} from '../store/run'
import { shopStore } from '../store/shop'
import { BagScreen } from './BagScreen'
import { BattleView } from './BattleView'
import { BossRewardScreen } from './BossRewardScreen'
import { CodexScreen } from './CodexScreen'
import { DropScreen } from './DropScreen'
import { MetaScreen } from './MetaScreen'
import { ShopScreen } from './ShopScreen'

const enemyById = new Map(enemies.map((enemy) => [enemy.id, enemy]))

function enemyHpText(enemy: RuntimeEnemy): string {
  if ('hp' in enemy) return `HP ${enemy.hp}`
  return enemy.phases.map((phase, index) => `P${index + 1} ${phase.hp}`).join(' / ')
}

function enemyAbilityText(enemy: RuntimeEnemy): string {
  const names =
    'hp' in enemy
      ? enemy.abilities.map((ability) => ability.name)
      : enemy.phases.flatMap((phase) => phase.abilities.map((ability) => ability.name))
  return names.slice(0, 3).join(' / ')
}

export function GameScreen() {
  const state = useStore(runStore)
  const codex = useStore(codexStore)
  const dropProgress = useStore(dropProgressStore)
  const meta = useStore(metaStore)
  const [shopOpen, setShopOpen] = useState(false)
  const [codexOpen, setCodexOpen] = useState(false)

  useEffect(() => {
    if (state.phase === 'idle') {
      shopStore.getState().resetShop()
      setShopOpen(false)
    }
  }, [state.phase])

  useEffect(() => {
    codexStore
      .getState()
      .discoverItems([
        ...state.bag.items.map((item) => item.itemId),
        ...state.storage.items.map((item) => item.itemId),
      ])
  }, [state.bag.items, state.storage.items])

  useEffect(() => {
    if (state.phase === 'result' && state.result !== null && state.runSeed !== null) {
      metaStore
        .getState()
        .claimRunResult(state.runSeed, state.result, state.abyssLevel)
    }
  }, [state.phase, state.result, state.runSeed, state.abyssLevel])

  const currentEnemyId = getCurrentEnemyId(state)
  const currentElite =
    state.runSeed !== null && currentEnemyId !== null
      ? isEliteBattle(state.runSeed, state.battleIndex, state.abyssLevel)
      : false

  const currentEnemyDefinition = useMemo(() => {
    if (currentEnemyId === null) return null
    prepareAbyssEnemyDefinition(currentEnemyId, state.abyssLevel, currentElite)
    return enemyById.get(currentEnemyId) ?? null
  }, [currentEnemyId, state.abyssLevel, currentElite])

  const combatSetup = useMemo(
    () => (state.phase === 'battle' ? selectCurrentCombatSetup(state) : null),
    [
      state.phase,
      state.runSeed,
      state.battleIndex,
      state.currentHp,
      state.maxHp,
      state.gold,
      state.bag.items,
      state.abyssLevel,
      currentEnemyDefinition,
    ],
  )
  const replay = useMemo(
    () => (combatSetup === null ? null : createCombatReplay(combatSetup)),
    [combatSetup],
  )
  const currentEnemyPreview =
    currentEnemyId === null
      ? null
      : getEnemyPreview(currentEnemyId, codex.discoveredEnemyIds)
  const pendingBatch =
    state.runSeed !== null &&
    dropProgress.pendingBatch?.key.startsWith(`${String(state.runSeed)}:`) === true
      ? dropProgress.pendingBatch
      : null

  if (pendingBatch !== null) {
    return (
      <DropScreen
        batch={pendingBatch}
        onComplete={() => {
          const isBossBonus = pendingBatch.key.endsWith(':bonus')
          dropProgress.clearPendingBatch(pendingBatch.key)
          if (isBossBonus) runStore.getState().completeBossBonusDrops()
        }}
      />
    )
  }

  if (state.phase === 'bossReward') {
    const claimBossReward = (
      expansionChoice: BossExpansionChoice,
      benefitChoice: BossBenefitChoice,
    ) => {
      if (state.runSeed === null) throw new Error('Boss reward requires an active run seed')
      const baseKey = `${String(state.runSeed)}:${state.battleIndex}`
      if (benefitChoice === 'additionalDrops') {
        dropProgress.activateBossBonus(baseKey)
      } else {
        dropProgress.discardBossBonus(baseKey)
      }
      state.claimBossReward(expansionChoice, benefitChoice)
    }
    return <BossRewardScreen onClaim={claimBossReward} />
  }

  if (codexOpen && state.phase !== 'battle') {
    return <CodexScreen onClose={() => setCodexOpen(false)} />
  }

  if (state.phase === 'idle') {
    return <MetaScreen onOpenCodex={() => setCodexOpen(true)} />
  }

  if (shopOpen && state.phase === 'preBattle') {
    return <ShopScreen onClose={() => setShopOpen(false)} />
  }

  if (state.phase === 'battle') {
    if (replay === null) {
      return (
        <main className="app-shell">
          <section className="intro-panel">
            <h1>Battle unavailable</h1>
            <p>現在の周回状態から戦闘入力を作成できませんでした。</p>
          </section>
        </main>
      )
    }

    return (
      <BattleView
        replay={replay}
        onComplete={() => {
          const resolution = removeTemporaryAffixMaxHp(
            replay.finalState,
            battleResolutionFromCombatState(replay.finalState),
          )
          if (resolution.result === 'playerVictory' && state.runSeed !== null) {
            const enemy = currentEnemyDefinition ??
              (currentEnemyId === null ? undefined : enemyById.get(currentEnemyId))
            if (enemy === undefined || enemy === null) {
              throw new Error('Victory enemy metadata is unavailable')
            }
            const request = {
              runSeed: state.runSeed,
              battleIndex: state.battleIndex,
              area: enemy.area as 1 | 2 | 3,
              isBoss: enemy.isBoss,
              abyssLevel: state.abyssLevel,
              elite: currentElite,
              unlockedItemIds: meta.unlockedItemIds,
              dropLuckPercent: getDropLuckPercent(state.bag.items.map((item) => item.itemId)),
            }
            if (enemy.isBoss) dropProgress.prepareBossBatch(request)
            else dropProgress.prepareBatch(request)
          }
          state.completeBattle(resolution)
        }}
      />
    )
  }

  if (state.phase === 'result') {
    const nextAbyssUnlocked =
      state.result?.outcome === 'cleared' &&
      state.abyssLevel < meta.maxUnlockedAbyssLevel
    return (
      <main className="app-shell">
        <section className={`intro-panel run-result-panel ${state.result?.outcome ?? ''}`}>
          <p className="eyebrow">Expedition result · Abyss Lv {state.abyssLevel}</p>
          <h1>{state.result?.outcome === 'cleared' ? 'CLEAR' : 'DEFEAT'}</h1>
          <dl className="result-stats result-stats--run">
            <div>
              <dt>Reached</dt>
              <dd>{state.result?.reachedBattleCount ?? state.battleIndex + 1}/{RUN_BATTLE_COUNT}</dd>
            </div>
            <div>
              <dt>Wins</dt>
              <dd>{state.result?.battlesWon ?? state.battlesWon}</dd>
            </div>
            <div className="result-souls">
              <dt>Soul fragments</dt>
              <dd>+{state.result?.earnedSoulFragments ?? 0}</dd>
            </div>
            <div>
              <dt>Total souls</dt>
              <dd>{meta.soulFragments}</dd>
            </div>
            <div>
              <dt>HP</dt>
              <dd>
                {Math.round(state.currentHp)} / {Math.round(state.maxHp)}
              </dd>
            </div>
            <div>
              <dt>Gold</dt>
              <dd>{Math.round(state.gold)}G</dd>
            </div>
          </dl>
          {nextAbyssUnlocked ? (
            <p className="elite-note">深淵Lv {state.abyssLevel + 1}を解放しました。</p>
          ) : null}
          <div className="result-action-row">
            <button type="button" className="codex-inline-button" onClick={() => setCodexOpen(true)}>
              図鑑を見る
            </button>
            <button type="button" className="result-button" onClick={state.resetRun}>
              ホームへ戻る
            </button>
          </div>
        </section>
      </main>
    )
  }

  const openShop = () => {
    if (state.phase !== 'preBattle' || state.runSeed === null || currentEnemyId === null) return
    const enemy = currentEnemyDefinition ?? enemyById.get(currentEnemyId)
    if (enemy === undefined || enemy === null) throw new Error('Shop enemy metadata is unavailable')
    shopStore.getState().prepareShop({
      runSeed: state.runSeed,
      battleIndex: state.battleIndex,
      area: enemy.area as 1 | 2 | 3,
      abyssLevel: state.abyssLevel,
      unlockedItemIds: meta.unlockedItemIds,
    })
    setShopOpen(true)
  }

  const beginEncounter = () => {
    if (state.phase !== 'preBattle' || currentEnemyId === null) return
    codexStore.getState().discoverEnemy(currentEnemyId)
    setShopOpen(false)
    setCodexOpen(false)
    state.beginBattle()
  }

  return (
    <>
      <BagScreen />
      {state.phase === 'preBattle' && currentEnemyPreview !== null ? (
        <aside className="battle-launch" aria-label="次の戦闘">
          <div
            className={`enemy-forecast${currentEnemyPreview.discovered ? '' : ' is-unknown'}${
              currentElite ? ' is-elite' : ''
            }`}
          >
            <span>
              {currentElite ? <b className="elite-badge">ELITE · </b> : null}
              {currentEnemyPreview.discovered ? 'NEXT ENEMY' : 'FIRST ENCOUNTER'} · AREA {currentEnemyPreview.area}
            </span>
            <strong>{currentEnemyPreview.name}</strong>
            <small>{currentEnemyPreview.hint}</small>
            {currentEnemyPreview.discovered ? (
              <div className="enemy-forecast__details">
                <em>{enemyHpText(currentEnemyPreview.enemy)}</em>
                <em>報酬 {currentEnemyPreview.enemy.gold}G</em>
                <em>{enemyAbilityText(currentEnemyPreview.enemy)}</em>
              </div>
            ) : null}
          </div>
          <div className="battle-launch__actions">
            <button type="button" className="codex-launch-button" onClick={() => setCodexOpen(true)}>
              図鑑
            </button>
            <button type="button" className="shop-launch-button" onClick={openShop}>
              ショップ
            </button>
            <button type="button" onClick={beginEncounter} disabled={state.bag.items.length === 0}>
              戦闘開始
            </button>
          </div>
        </aside>
      ) : null}
    </>
  )
}
