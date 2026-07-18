import { describe, expect, it } from 'vitest'

import { createCombatState, runTicks, stepCombat } from '../src/engine/combat'

describe('combat engine skeleton', () => {
  it('keeps CD-zero items ready until stamina recovers, then activates in grid order', () => {
    const initialState = createCombatState({
      build: [
        {
          instanceId: 'lower-item',
          itemId: 'W02',
          position: { row: 1, column: 0 },
          initialCooldown: 0,
        },
        {
          instanceId: 'upper-item',
          itemId: 'W02',
          position: { row: 0, column: 2 },
          initialCooldown: 0,
        },
      ],
      enemyId: 'EN_A1_01',
      player: { stamina: 0.8 },
      enemy: { initialCooldowns: [99] },
    })

    const firstTick = stepCombat(initialState)

    expect(firstTick.activations).toEqual([])
    expect(firstTick.state.player.stamina).toBe(0.9)
    expect(firstTick.state.player.items.map((item) => item.cooldown)).toEqual([0, 0])

    const secondTick = stepCombat(firstTick.state)

    expect(secondTick.activations).toEqual([{ side: 'player', sourceId: 'upper-item' }])
    expect(secondTick.state.player.stamina).toBe(0)
    expect(secondTick.state.player.items.map((item) => item.cooldown)).toEqual([0, 1.8])
    expect(secondTick.state.enemy.hp).toBe(37)

    let delayedActivation = secondTick
    for (let index = 0; index < 10; index += 1) {
      delayedActivation = stepCombat(delayedActivation.state)
    }

    expect(delayedActivation.activations).toEqual([{ side: 'player', sourceId: 'lower-item' }])
    expect(delayedActivation.state.player.items[0]?.cooldown).toBe(1.8)
    expect(delayedActivation.state.enemy.hp).toBe(29)
  })

  it('resolves the player phase before enemy abilities and supports provisional block/damage', () => {
    const initialState = createCombatState({
      build: [
        {
          instanceId: 'wooden-shield',
          itemId: 'A01',
          position: { row: 0, column: 0 },
          initialCooldown: 0,
        },
      ],
      enemyId: 'EN_A1_01',
      enemy: { initialCooldowns: [0] },
    })

    const tick = stepCombat(initialState)

    expect(tick.activations).toEqual([
      { side: 'player', sourceId: 'wooden-shield' },
      { side: 'enemy', sourceId: 'EN_A1_01:ability:0' },
    ])
    expect(tick.state.player.hp).toBe(100)
    expect(tick.state.player.block).toBe(3)
    expect(tick.state.player.items[0]?.cooldown).toBe(2.2)
    expect(tick.state.enemy.abilities[0]?.cooldown).toBe(0.9)
  })

  it('remains numerically valid after 1000 ticks', () => {
    const initialState = createCombatState({
      build: [
        {
          instanceId: 'dagger',
          itemId: 'W01',
          position: { row: 0, column: 0 },
        },
      ],
      enemyId: 'EN_A1_01',
      player: { maxHp: 1_000_000, hp: 1_000_000 },
      enemy: { hp: 1_000_000, initialCooldowns: [10_000] },
    })

    const finalState = runTicks(initialState, 1000)
    const numericValues = [
      finalState.time,
      finalState.player.hp,
      finalState.player.block,
      finalState.player.stamina,
      finalState.enemy.hp,
      finalState.enemy.block,
      ...finalState.player.items.map((item) => item.cooldown),
      ...finalState.enemy.abilities.map((ability) => ability.cooldown),
    ]

    expect(finalState.tick).toBe(1000)
    expect(finalState.time).toBe(100)
    expect(finalState.result).toBe('ongoing')
    expect(numericValues.every(Number.isFinite)).toBe(true)
    expect(finalState.player.stamina).toBeGreaterThanOrEqual(0)
    expect(finalState.player.stamina).toBeLessThanOrEqual(finalState.player.staminaCap)
    expect(finalState.player.items.every((item) => item.cooldown >= 0)).toBe(true)
    expect(finalState.enemy.abilities.every((ability) => ability.cooldown >= 0)).toBe(true)
  })
})
