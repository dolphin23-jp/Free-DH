import { describe, expect, it } from 'vitest'

import { createCombatState, stepCombat } from '../src/engine/combat'

describe('combat triggers', () => {
  it('does not reflect reflected damage', () => {
    const state = createCombatState({
      build: [
        {
          instanceId: 'thorn-armor',
          itemId: 'A09',
          position: { row: 0, column: 0 },
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'reflect',
      enemy: {
        initialCooldowns: [0],
        triggers: [{ trigger: 'onDamaged', type: 'reflect', value: 5 }],
      },
    })

    const tick = stepCombat(state)

    expect(tick.state.player.hp).toBe(97)
    expect(tick.state.enemy.hp).toBe(42)
    expect(tick.damages).toHaveLength(2)
    expect(tick.damages[1]).toMatchObject({
      sourceId: 'thorn-armor',
      amount: 3,
      triggersAllowed: false,
    })
    expect(tick.triggerEvents).toEqual([
      {
        sourceSide: 'player',
        sourceId: 'thorn-armor',
        trigger: 'onDamaged',
        effectType: 'reflect',
        value: 3,
        depth: 1,
      },
    ])
  })

  it('does not let onHit damage retrigger onHit', () => {
    const state = createCombatState({
      build: [
        {
          instanceId: 'dagger',
          itemId: 'W01',
          position: { row: 0, column: 0 },
          initialCooldown: 0,
          resolvedTriggers: [{ trigger: 'onHit', type: 'damage', value: 2 }],
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'on-hit',
      enemy: { hp: 100, initialCooldowns: [99] },
    })

    const tick = stepCombat(state)

    expect(tick.state.enemy.hp).toBe(94)
    expect(tick.damages.map((damage) => damage.amount)).toEqual([4, 2])
    expect(tick.damages[1]?.triggersAllowed).toBe(false)
    expect(tick.triggerEvents.filter((event) => event.trigger === 'onHit')).toHaveLength(1)
  })

  it('fires hpBelow only on the first threshold crossing', () => {
    let state = createCombatState({
      build: [
        {
          instanceId: 'threshold-charm',
          itemId: 'C01',
          position: { row: 0, column: 0 },
          resolvedTriggers: [
            {
              trigger: 'hpBelow',
              type: 'heal',
              value: 10,
              thresholdPercent: 50,
            },
          ],
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'hp-below',
      player: { maxHp: 100, hp: 51 },
      enemy: { initialCooldowns: [0] },
    })

    let hpBelowCount = 0

    for (let index = 0; index < 30; index += 1) {
      const tick = stepCombat(state)
      state = tick.state
      hpBelowCount += tick.triggerEvents.filter((event) => event.trigger === 'hpBelow').length
    }

    expect(hpBelowCount).toBe(1)
    expect(state.player.hp).toBe(49)
    expect(state.consumedTriggerKeys).toEqual(['player:threshold-charm:0:hpBelow'])
  })

  it('resolves battleStart in grid order and skips items already sealed', () => {
    const state = createCombatState({
      build: [
        {
          instanceId: 'sealed-cloak',
          itemId: 'A07',
          position: { row: 0, column: 0 },
          sealed: true,
        },
        {
          instanceId: 'bread',
          itemId: 'T04',
          position: { row: 0, column: 1 },
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'battle-start',
      player: { maxHp: 100, hp: 90 },
      enemy: { initialCooldowns: [99] },
    })

    const tick = stepCombat(state)

    expect(tick.state.player.hp).toBe(95)
    expect(tick.state.player.block).toBe(0)
    expect(tick.triggerEvents.map((event) => event.sourceId)).toEqual(['bread'])
  })

  it('fires onBlocked only when block absorbs the full hit', () => {
    const state = createCombatState({
      build: [
        {
          instanceId: 'paladin-shield',
          itemId: 'A11',
          position: { row: 0, column: 0 },
          initialCooldown: 99,
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'blocked',
      player: { maxHp: 100, hp: 90, block: 3 },
      enemy: { initialCooldowns: [0] },
    })

    const tick = stepCombat(state)

    expect(tick.state.player.hp).toBe(92)
    expect(tick.state.player.block).toBe(0)
    expect(tick.triggerEvents.map((event) => event.trigger)).toEqual(['onBlocked'])
  })

  it('resolves onKill before battleWin once when combat ends', () => {
    const state = createCombatState({
      build: [
        {
          instanceId: 'dagger',
          itemId: 'W01',
          position: { row: 0, column: 0 },
          initialCooldown: 0,
        },
        {
          instanceId: 'kill-charm',
          itemId: 'C01',
          position: { row: 1, column: 0 },
          resolvedTriggers: [{ trigger: 'onKill', type: 'heal', value: 3 }],
        },
        {
          instanceId: 'piggy-bank',
          itemId: 'E01',
          position: { row: 1, column: 1 },
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'terminal',
      player: { maxHp: 100, hp: 90 },
      enemy: { hp: 4, initialCooldowns: [99] },
    })

    const tick = stepCombat(state)

    expect(tick.state.result).toBe('playerVictory')
    expect(tick.state.player.hp).toBe(93)
    expect(tick.state.goldGained).toBe(13)
    expect(tick.triggerEvents.map((event) => event.trigger)).toEqual(['onKill', 'battleWin'])
  })
})
