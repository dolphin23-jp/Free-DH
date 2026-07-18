import {
  createCombatState,
  stepCombat,
  type CombatEvent,
  type CombatResult,
  type CombatSetup,
  type CombatState,
} from './combat'

export type ReplaySpeed = 1 | 2

export interface ReplayActorSnapshot {
  hp: number
  maxHp: number
  block: number
}

export interface ReplayEnemySnapshot extends ReplayActorSnapshot {
  phaseIndex: number
}

export interface CombatReplaySnapshot {
  time: number
  result: CombatResult
  player: ReplayActorSnapshot
  enemy: ReplayEnemySnapshot
}

export interface CombatReplayFrame {
  time: number
  events: readonly CombatEvent[]
  snapshot: CombatReplaySnapshot
}

export interface CombatReplay {
  result: Exclude<CombatResult, 'ongoing'>
  durationSeconds: number
  events: readonly CombatEvent[]
  initial: CombatReplaySnapshot
  frames: readonly CombatReplayFrame[]
  finalState: CombatState
}

function snapshotCombatState(state: CombatState): CombatReplaySnapshot {
  return {
    time: state.time,
    result: state.result,
    player: {
      hp: Math.max(0, state.player.hp),
      maxHp: state.player.maxHp,
      block: state.player.block,
    },
    enemy: {
      hp: Math.max(0, state.enemy.hp),
      maxHp: state.enemy.maxHp,
      block: state.enemy.block,
      phaseIndex: state.enemy.phaseIndex,
    },
  }
}

/**
 * Runs the authoritative combat engine and records display snapshots at every
 * event-bearing tick. React consumes these frames without reimplementing rules.
 */
export function createCombatReplay(setup: CombatSetup): CombatReplay {
  let state = createCombatState(setup)
  const initial = snapshotCombatState(state)
  const frames: CombatReplayFrame[] = []
  let eventCursor = 0

  if (state.events.length > 0) {
    frames.push({
      time: 0,
      events: [...state.events],
      snapshot: initial,
    })
    eventCursor = state.events.length
  }

  while (state.result === 'ongoing') {
    const previousResult = state.result
    state = stepCombat(state).state
    const events = state.events.slice(eventCursor)

    if (events.length > 0 || state.result !== previousResult) {
      frames.push({
        time: state.time,
        events,
        snapshot: snapshotCombatState(state),
      })
    }
    eventCursor = state.events.length
  }

  return {
    result: state.result,
    durationSeconds: state.time,
    events: [...state.events],
    initial,
    frames,
    finalState: state,
  }
}

export function getReplayFrameAtTime(
  replay: Pick<CombatReplay, 'frames'>,
  playbackTime: number,
): CombatReplayFrame | null {
  if (!Number.isFinite(playbackTime) || playbackTime < 0) {
    throw new RangeError('playbackTime must be a finite non-negative number')
  }

  let selected: CombatReplayFrame | null = null
  for (const frame of replay.frames) {
    if (frame.time > playbackTime) break
    selected = frame
  }
  return selected
}

export function getReplaySnapshotAtTime(
  replay: Pick<CombatReplay, 'initial' | 'frames'>,
  playbackTime: number,
): CombatReplaySnapshot {
  return getReplayFrameAtTime(replay, playbackTime)?.snapshot ?? replay.initial
}

export function getReplayProgress(playbackTime: number, durationSeconds: number): number {
  if (!Number.isFinite(playbackTime) || playbackTime < 0) {
    throw new RangeError('playbackTime must be a finite non-negative number')
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
    throw new RangeError('durationSeconds must be a finite non-negative number')
  }
  if (durationSeconds === 0) return 1
  return Math.min(1, playbackTime / durationSeconds)
}

export function toggleReplaySpeed(speed: ReplaySpeed): ReplaySpeed {
  return speed === 1 ? 2 : 1
}
