import { useEffect, useMemo, useState } from 'react'
import { useStore } from 'zustand'

import { enemies, type RuntimeEnemy } from '../data'
import { removeTemporaryAffixMaxHp } from '../engine/affixes'
import { getDropLuckPercent } from '../engine/drops'
import { createCombatReplay } from '../engine/replay'
import { codexStore, getEnemyPreview } from '../store/codex'
import { dropProgressStore } from '../store/drop-progress'
import {
  battleResolutionFromCombatState,
  getCurrentEnemyId,
  runStore,
  selectCurrentCombatSetup,
} from '../store/run'
import { shopStore } from '../store/shop'
import { BagScreen } from './BagScreen'
import { BattleView } from './BattleView'
import { CodexScreen } from './CodexScreen'
import { DropScreen } from './DropScreen'
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
    ],
  )
  const replay = useMemo(
    () => (combatSetup === null ? null : createCombatReplay(combatSetup)),
    [combatSetup],
  )
  const currentEnemyId = getCurrentEnemyId(state)
  const currentEnemyPreview =
    currentEnemyId === null
      ? null
      : getEnemyPreview(currentEnemyId, codex.discoveredEnemyIds)
  const expectedDropBattleIndex =
    state.phase === 'result' ? state.battleIndex : Math.max(0, state.battleIndex - 1)
  const pendingBatch =
    state.runSeed !== null &&
    dropProgress.pendingBatch?.key === `${String(state.runSeed)}:${expectedDropBattleIndex}`
      ? dropProgress.pendingBatch
      : null

  if (pendingBatch !== null) {
    return (
      <DropScreen
        batch={pendingBatch}
        onComplete={() => dropProgress.clearPendingBatch(pendingBatch.key)}
      />
    )
  }

  if (codexOpen && state.phase !== 'battle') {
    return <CodexScreen onClose={() => setCodexOpen(false)} />
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
            const enemy = currentEnemyId === null ? undefined : enemyById.get(currentEnemyId)
            if (enemy === undefined) throw new Error('Victory enemy metadata is unavailable')
            dropProgress.prepareBatch({
              runSeed: state.runSeed,
              battleIndex: state.battleIndex,
              area: enemy.area as 1 | 2 | 3,
              isBoss: enemy.isBoss,
              abyssLevel: 0,
              dropLuckPercent: getDropLuckPercent(state.bag.items.map((item) => item.itemId)),
            })
          }
          state.completeBattle(resolution)
        }}
      />
    )
  }

  if (state.phase === 'result') {
    return (
      <main className="app-shell">
        <section className={`intro-panel run-result-panel ${state.result?.outcome ?? ''}`}>
          <p className="eyebrow">Expedition result</p>
          <h1>{state.result?.outcome === 'cleared' ? 'CLEAR' : 'DEFEAT'}</h1>
          <dl className="result-stats">
            <div>
              <dt>Wins</dt>
              <dd>{state.result?.battlesWon ?? state.battlesWon}</dd>
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
    const enemy = enemyById.get(currentEnemyId)
    if (enemy === undefined) throw new Error('Shop enemy metadata is unavailable')
    shopStore.getState().prepareShop({
      runSeed: state.runSeed,
      battleIndex: state.battleIndex,
      area: enemy.area as 1 | 2 | 3,
      abyssLevel: 0,
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
      {state.phase === 'idle' ? (
        <button type="button" className="codex-launch" onClick={() => setCodexOpen(true)}>
          図鑑
        </button>
      ) : null}
      {state.phase === 'preBattle' && currentEnemyPreview !== null ? (
        <aside className="battle-launch" aria-label="次の戦闘">
          <div className={`enemy-forecast${currentEnemyPreview.discovered ? '' : ' is-unknown'}`}>
            <span>
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
