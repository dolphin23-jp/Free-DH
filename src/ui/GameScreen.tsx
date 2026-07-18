import { useMemo } from 'react'
import { useStore } from 'zustand'

import { enemies } from '../data'
import { createCombatReplay } from '../engine/replay'
import {
  battleResolutionFromCombatState,
  getCurrentEnemyId,
  runStore,
  selectCurrentCombatSetup,
} from '../store/run'
import { BagScreen } from './BagScreen'
import { BattleView } from './BattleView'

const enemyNameById = new Map(enemies.map((enemy) => [enemy.id, enemy.name]))

export function GameScreen() {
  const state = useStore(runStore)
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
  const currentEnemyName =
    currentEnemyId === null ? null : (enemyNameById.get(currentEnemyId) ?? currentEnemyId)

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
        onComplete={() => state.completeBattle(battleResolutionFromCombatState(replay.finalState))}
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
          <button type="button" className="result-button" onClick={state.resetRun}>
            ホームへ戻る
          </button>
        </section>
      </main>
    )
  }

  return (
    <>
      <BagScreen />
      {state.phase === 'preBattle' && currentEnemyName !== null ? (
        <aside className="battle-launch" aria-label="次の戦闘">
          <div>
            <span>NEXT ENEMY</span>
            <strong>{currentEnemyName}</strong>
          </div>
          <button type="button" onClick={state.beginBattle} disabled={state.bag.items.length === 0}>
            戦闘開始
          </button>
        </aside>
      ) : null}
    </>
  )
}
