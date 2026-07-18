import { describe, expect, it } from 'vitest'

import { simulate } from '../src/engine/combat'
import {
  createCombatReplay,
  getReplayFrameAtTime,
  getReplayProgress,
  getReplaySnapshotAtTime,
  toggleReplaySpeed,
} from '../src/engine/replay'
import { diagnosticBuilds, getStandardBuildForArea } from '../src/sim/builds'

describe('combat replay', () => {
  it('matches simulate for the same build, enemy, and seed', () => {
    const build = getStandardBuildForArea(1).items
    const enemyId = 'EN_A1_01'
    const seed = 't14-replay-match'

    const simulation = simulate(build, enemyId, seed)
    const replay = createCombatReplay({ build, enemyId, seed })
    const finalSnapshot = getReplaySnapshotAtTime(replay, replay.durationSeconds)

    expect(replay.result).toBe(simulation.result)
    expect(replay.events).toEqual(simulation.events)
    expect(finalSnapshot.result).toBe(simulation.result)
    expect(finalSnapshot.player.hp).toBe(simulation.stats.playerHpRemaining)
    expect(finalSnapshot.enemy.hp).toBe(simulation.stats.enemyHpRemaining)
    expect(replay.frames.at(-1)?.events.at(-1)).toMatchObject({
      type: 'end',
      detail: simulation.result,
    })
  })

  it('selects only frames whose event time has elapsed', () => {
    const build = getStandardBuildForArea(1).items
    const replay = createCombatReplay({ build, enemyId: 'EN_A1_04', seed: 'frame-selection' })
    const first = replay.frames[0]

    expect(first).toBeDefined()
    if (first === undefined) return

    expect(getReplayFrameAtTime(replay, Math.max(0, first.time - 0.01))).toBeNull()
    expect(getReplayFrameAtTime(replay, first.time)).toEqual(first)
    expect(getReplayFrameAtTime(replay, replay.durationSeconds)).toEqual(replay.frames.at(-1))
  })

  it('uses engine snapshots for phase transitions instead of UI calculations', () => {
    const build = diagnosticBuilds.demonKingLegendary.items
    const replay = createCombatReplay({
      build,
      enemyId: 'EN_A3_05',
      seed: 'demon-phase-replay',
      player: { hp: 1000, maxHp: 1000, staminaRegenPerSecond: 10 },
    })
    const phaseFrame = replay.frames.find((frame) =>
      frame.events.some((event) => event.type === 'phase'),
    )

    expect(phaseFrame).toBeDefined()
    expect(phaseFrame?.snapshot.enemy.phaseIndex).toBe(1)
    expect(phaseFrame?.snapshot.enemy.hp).toBeGreaterThan(0)
    expect(phaseFrame?.snapshot.enemy.maxHp).toBeGreaterThan(0)
  })

  it('toggles 1x and 2x playback and clamps progress', () => {
    expect(toggleReplaySpeed(1)).toBe(2)
    expect(toggleReplaySpeed(2)).toBe(1)
    expect(getReplayProgress(0, 12)).toBe(0)
    expect(getReplayProgress(6, 12)).toBe(0.5)
    expect(getReplayProgress(20, 12)).toBe(1)
  })
})
