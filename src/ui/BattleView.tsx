import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useStore } from 'zustand'

import { enemies, items } from '../data'
import type { CombatEvent, CombatSide } from '../engine/combat'
import {
  getReplayFrameAtTime,
  getReplayProgress,
  getReplaySnapshotAtTime,
  toggleReplaySpeed,
  type CombatReplay,
  type ReplaySpeed,
} from '../engine/replay'
import { settingsStore } from '../store/settings'

interface BattleViewProps {
  replay: CombatReplay
  onComplete: () => void
}

const itemNameById = new Map(items.map((item) => [item.id, item.name]))
const enemyNameById = new Map(enemies.map((enemy) => [enemy.id, enemy.name]))

type DamageEvent = Extract<CombatEvent, { type: 'damage' }>

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function hpPercent(hp: number, maxHp: number): number {
  return maxHp <= 0 ? 0 : clampPercent((hp / maxHp) * 100)
}

function displayAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function sourceLabel(replay: CombatReplay, sourceId: string): string {
  const playerItem = replay.finalState.player.items.find((item) => item.instanceId === sourceId)
  if (playerItem !== undefined) {
    return itemNameById.get(playerItem.itemId) ?? playerItem.itemId
  }

  if (sourceId.startsWith(replay.finalState.enemy.id)) {
    return enemyNameById.get(replay.finalState.enemy.id) ?? replay.finalState.enemy.id
  }

  return sourceId
}

function eventText(replay: CombatReplay, event: CombatEvent): string {
  if (event.type === 'activate') {
    return `${event.side === 'player' ? 'PLAYER' : 'ENEMY'}: ${sourceLabel(replay, event.sourceId)} 発動`
  }
  if (event.type === 'damage') {
    const hpDamage = Math.max(0, event.amount - event.blocked)
    const crit = event.crit ? ' CRIT' : ''
    const blocked = event.blocked > 0 ? ` / BLOCK ${event.blocked}` : ''
    return `${event.side === 'player' ? 'PLAYER' : 'ENEMY'} -${hpDamage}${crit}${blocked}`
  }
  if (event.type === 'heal') {
    return `${event.side === 'player' ? 'PLAYER' : 'ENEMY'} +${event.amount} HP`
  }
  if (event.type === 'block') {
    return `${event.side === 'player' ? 'PLAYER' : 'ENEMY'} +${event.amount} BLOCK`
  }
  if (event.type === 'gold') {
    return `GOLD +${event.amount}`
  }
  if (event.type === 'status') {
    return `${event.side === 'player' ? 'PLAYER' : 'ENEMY'} ${event.status.toUpperCase()} ${event.value}`
  }
  if (event.type === 'seal') {
    return `${sourceLabel(replay, event.itemId)} SEALED`
  }
  return `${event.type.toUpperCase()}: ${event.detail}`
}

function EventBurst({ replay, events }: { replay: CombatReplay; events: readonly CombatEvent[] }) {
  const visible = events.filter((event) => event.type !== 'activate').slice(-5)
  return (
    <div className="event-burst" aria-live="polite">
      {visible.map((event, index) => (
        <div
          key={`${event.t}:${event.type}:${index}`}
          className={`event-chip event-${event.type}${
            event.type === 'damage' ? ` target-${event.side}` : ''
          }`}
        >
          {eventText(replay, event)}
        </div>
      ))}
    </div>
  )
}

function DamageNumbers({
  side,
  events,
}: {
  side: CombatSide
  events: readonly DamageEvent[]
}) {
  const visible = events
    .filter((event) => event.side === side)
    .map((event) => ({ event, amount: Math.max(0, event.amount - event.blocked) }))
    .filter(({ amount }) => amount > 0)

  return (
    <div className="damage-number-layer" aria-hidden="true">
      {visible.map(({ event, amount }, index) => (
        <span
          key={`${event.t}:${event.side}:${event.kind}:${index}`}
          className={`damage-number${event.crit ? ' is-crit' : ''}`}
          style={{ '--damage-index': index } as CSSProperties}
        >
          −{displayAmount(amount)}
          {event.crit ? <b>CRIT</b> : null}
        </span>
      ))}
    </div>
  )
}

function ActorPanel({
  side,
  name,
  hp,
  maxHp,
  block,
  active,
  damageEvents,
}: {
  side: CombatSide
  name: string
  hp: number
  maxHp: number
  block: number
  active: boolean
  damageEvents: readonly DamageEvent[]
}) {
  return (
    <section className={`combatant combatant-${side}${active ? ' is-active' : ''}`}>
      <DamageNumbers side={side} events={damageEvents} />
      <div className="combatant-heading">
        <div>
          <span className="combatant-side">{side === 'player' ? 'PLAYER' : 'ENEMY'}</span>
          <h2>{name}</h2>
        </div>
        <span className="block-badge">◆ {Math.round(block)}</span>
      </div>
      <div className="hp-label">
        <span>HP</span>
        <strong>
          {Math.round(hp)} / {Math.round(maxHp)}
        </strong>
      </div>
      <div className="hp-track" aria-label={`${name} HP ${hp} / ${maxHp}`}>
        <div className="hp-fill" style={{ width: `${hpPercent(hp, maxHp)}%` }} />
      </div>
    </section>
  )
}

export function BattleView({ replay, onComplete }: BattleViewProps) {
  const settings = useStore(settingsStore)
  const [speed, setSpeed] = useState<ReplaySpeed>(1)
  const [playbackTime, setPlaybackTime] = useState(0)
  const stageRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPlaybackTime((current) => Math.min(replay.durationSeconds, current + 0.05 * speed))
    }, 50)
    return () => window.clearInterval(interval)
  }, [replay.durationSeconds, speed])

  const frame = getReplayFrameAtTime(replay, playbackTime)
  const snapshot = getReplaySnapshotAtTime(replay, playbackTime)
  const events = frame?.events ?? []
  const damageEvents = events.filter(
    (event): event is DamageEvent => event.type === 'damage',
  )
  const activePlayer = events.some((event) => event.type === 'activate' && event.side === 'player')
  const activeEnemy = events.some((event) => event.type === 'activate' && event.side === 'enemy')
  const progress = getReplayProgress(playbackTime, replay.durationSeconds)
  const finished = progress >= 1
  const enemyName = enemyNameById.get(replay.finalState.enemy.id) ?? replay.finalState.enemy.id
  const recentLog = useMemo(
    () => replay.events.filter((event) => event.t <= playbackTime).slice(-8).reverse(),
    [playbackTime, replay.events],
  )
  const impactSignature = damageEvents
    .filter((event) => event.amount - event.blocked > 0)
    .map((event, index) => `${event.t}:${event.side}:${event.amount}:${index}`)
    .join('|')

  useEffect(() => {
    if (impactSignature.length === 0 || settings.reducedEffects) return
    stageRef.current?.animate(
      [
        { transform: 'translate3d(0, 0, 0)' },
        { transform: 'translate3d(-5px, 2px, 0)' },
        { transform: 'translate3d(4px, -2px, 0)' },
        { transform: 'translate3d(-2px, 1px, 0)' },
        { transform: 'translate3d(0, 0, 0)' },
      ],
      { duration: 150, easing: 'ease-out' },
    )
  }, [impactSignature, settings.reducedEffects])

  return (
    <main className="app-shell battle-screen">
      <header className="battle-toolbar">
        <div>
          <p className="eyebrow">Deterministic combat replay</p>
          <h1>Battle</h1>
        </div>
        <div className="battle-controls">
          <span>
            {playbackTime.toFixed(1)}s / {replay.durationSeconds.toFixed(1)}s
          </span>
          <button
            type="button"
            className="speed-button"
            onClick={() => setSpeed((current) => toggleReplaySpeed(current))}
          >
            {speed}x
          </button>
        </div>
      </header>

      <div className="replay-progress" aria-label={`戦闘再生 ${Math.round(progress * 100)}%`}>
        <div style={{ width: `${progress * 100}%` }} />
      </div>

      <section ref={stageRef} className="battle-stage">
        <ActorPanel
          side="player"
          name="Adventurer"
          hp={snapshot.player.hp}
          maxHp={snapshot.player.maxHp}
          block={snapshot.player.block}
          active={activePlayer}
          damageEvents={damageEvents}
        />

        <div className="battle-center">
          <div className="versus-mark">VS</div>
          <EventBurst replay={replay} events={events} />
          <div className="phase-indicator">PHASE {snapshot.enemy.phaseIndex + 1}</div>
        </div>

        <ActorPanel
          side="enemy"
          name={enemyName}
          hp={snapshot.enemy.hp}
          maxHp={snapshot.enemy.maxHp}
          block={snapshot.enemy.block}
          active={activeEnemy}
          damageEvents={damageEvents}
        />
      </section>

      <section className="battle-lower-grid">
        <article className="panel activation-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Activation highlight</p>
              <h2>発動中</h2>
            </div>
          </div>
          <div className="activation-list">
            {events.filter((event) => event.type === 'activate').length === 0 ? (
              <p className="muted">次の発動を待っています。</p>
            ) : (
              events
                .filter((event): event is Extract<CombatEvent, { type: 'activate' }> =>
                  event.type === 'activate',
                )
                .map((event, index) => (
                  <div key={`${event.t}:${event.sourceId}:${index}`} className={`activation-row ${event.side}`}>
                    <span>{event.side}</span>
                    <strong>{sourceLabel(replay, event.sourceId)}</strong>
                  </div>
                ))
            )}
          </div>
        </article>

        <article className="panel combat-log-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Event log</p>
              <h2>直近のログ</h2>
            </div>
          </div>
          <ol className="combat-log">
            {recentLog.map((event, index) => (
              <li key={`${event.t}:${event.type}:${index}`}>
                <time>{event.t.toFixed(1)}s</time>
                <span>{eventText(replay, event)}</span>
              </li>
            ))}
          </ol>
        </article>
      </section>

      {finished ? (
        <section className={`battle-result ${replay.result}`}>
          <p>{replay.result === 'playerVictory' ? 'VICTORY' : 'DEFEAT'}</p>
          <button type="button" className="result-button" onClick={onComplete}>
            戦闘結果を確定
          </button>
        </section>
      ) : null}
    </main>
  )
}
