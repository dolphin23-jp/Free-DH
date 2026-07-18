import { describe, expect, it } from 'vitest'

import {
  calculateDamage,
  calculateModifiedCooldown,
  createCombatState,
  stepCombat,
} from '../src/engine/combat'

describe('damage pipeline', () => {
  it('adds damage multipliers before applying them once', () => {
    const state = createCombatState({
      build: [
        {
          instanceId: 'dagger',
          itemId: 'W01',
          position: { row: 0, column: 0 },
          initialCooldown: 0,
        },
        {
          instanceId: 'berserker-bracelet',
          itemId: 'C08',
          position: { row: 1, column: 0 },
        },
        {
          instanceId: 'devil-contract',
          itemId: 'E06',
          position: { row: 1, column: 1 },
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'combat',
      player: { maxHp: 100, hp: 40 },
      enemy: { hp: 100, initialCooldowns: [99] },
    })

    const tick = stepCombat(state)

    expect(tick.damages[0]).toMatchObject({
      amount: 7.2,
      critical: false,
      hpDamage: 7.2,
    })
    expect(tick.state.enemy.hp).toBe(92.8)
  })

  it('lets pierce damage bypass block without consuming it', () => {
    const state = createCombatState({
      build: [
        {
          instanceId: 'piercing-spear',
          itemId: 'W12',
          position: { row: 0, column: 0 },
          initialCooldown: 0,
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'combat',
      enemy: { hp: 100, block: 20, initialCooldowns: [99] },
    })

    const tick = stepCombat(state)

    expect(tick.damages[0]).toMatchObject({ pierce: true, blocked: 0, hpDamage: 10 })
    expect(tick.state.enemy.block).toBe(20)
    expect(tick.state.enemy.hp).toBe(90)
  })

  it('uses a weapon-specific critical multiplier override', () => {
    const state = createCombatState({
      build: [
        {
          instanceId: 'battle-axe',
          itemId: 'W08',
          position: { row: 0, column: 0 },
          initialCooldown: 0,
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 7,
      enemy: { hp: 100, initialCooldowns: [99] },
    })

    const tick = stepCombat(state)

    expect(tick.damages[0]).toMatchObject({ amount: 40, critical: true })
    expect(tick.state.enemy.hp).toBe(60)
  })

  it('subtracts flat damage reduction before block application', () => {
    const state = createCombatState({
      build: [
        {
          instanceId: 'iron-helmet',
          itemId: 'A03',
          position: { row: 0, column: 0 },
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'combat',
      enemy: { initialCooldowns: [0] },
    })

    const tick = stepCombat(state)

    expect(tick.damages[0]).toMatchObject({ amount: 2, hpDamage: 2 })
    expect(tick.state.player.hp).toBe(98)
  })

  it('caps cooldown reduction at 60 percent and enforces the 0.3 second floor', () => {
    expect(calculateModifiedCooldown(1, [-0.4, -0.4])).toBe(0.4)
    expect(calculateModifiedCooldown(0.5, [-0.6])).toBe(0.3)
  })

  it('applies global cooldown modifiers when an item resets', () => {
    const state = createCombatState({
      build: [
        {
          instanceId: 'sword',
          itemId: 'W02',
          position: { row: 0, column: 0 },
          initialCooldown: 0,
        },
        {
          instanceId: 'sage-hourglass',
          itemId: 'E05',
          position: { row: 1, column: 0 },
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'combat',
      enemy: { hp: 100, initialCooldowns: [99] },
    })

    const tick = stepCombat(state)

    expect(tick.state.player.items[0]?.cooldown).toBe(1.62)
  })

  it('keeps one decimal place after the full calculation', () => {
    expect(
      calculateDamage({
        base: 3,
        flatBonuses: [0.25],
        damageMultipliers: [0.1],
        critChancePercent: 0,
        critMultiplier: 2,
        specialMultiplier: 1,
        damageReduction: 0,
        randomValue: 0.5,
      }),
    ).toEqual({ amount: 3.6, critical: false })
  })
})
