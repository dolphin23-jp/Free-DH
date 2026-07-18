import { describe, expect, it } from 'vitest'

import { areItemsAdjacent, getAdjacentCells, getOccupiedCells } from '../src/engine/adjacency'
import { createCombatState, stepCombat } from '../src/engine/combat'

describe('adjacency geometry', () => {
  it('finds every orthogonally adjacent cell around a 2 by 3 item', () => {
    const placement = {
      position: { row: 1, column: 1 },
      size: [2, 3] as const,
    }

    expect(getOccupiedCells(placement)).toEqual([
      { row: 1, column: 1 },
      { row: 1, column: 2 },
      { row: 2, column: 1 },
      { row: 2, column: 2 },
      { row: 3, column: 1 },
      { row: 3, column: 2 },
    ])
    expect(getAdjacentCells(placement)).toEqual([
      { row: 0, column: 1 },
      { row: 0, column: 2 },
      { row: 1, column: 0 },
      { row: 1, column: 3 },
      { row: 2, column: 0 },
      { row: 2, column: 3 },
      { row: 3, column: 0 },
      { row: 3, column: 3 },
      { row: 4, column: 1 },
      { row: 4, column: 2 },
    ])
  })

  it('swaps width and height when an item is rotated', () => {
    expect(
      getOccupiedCells({
        position: { row: 1, column: 1 },
        size: [2, 3],
        rotated: true,
      }),
    ).toEqual([
      { row: 1, column: 1 },
      { row: 1, column: 2 },
      { row: 1, column: 3 },
      { row: 2, column: 1 },
      { row: 2, column: 2 },
      { row: 2, column: 3 },
    ])
  })

  it('uses diagonal contact only for range-eight adjacency', () => {
    const source = { position: { row: 1, column: 1 }, size: [1, 1] as const }
    const diagonal = { position: { row: 0, column: 0 }, size: [1, 1] as const }

    expect(areItemsAdjacent(source, diagonal)).toBe(false)
    expect(areItemsAdjacent(source, diagonal, true)).toBe(true)
  })
})

describe('combat adjacency snapshot', () => {
  it('applies each multi-cell source effect once even when two edges touch', () => {
    const state = createCombatState({
      build: [
        {
          instanceId: 'war-god-statue',
          itemId: 'C10',
          position: { row: 0, column: 0 },
        },
        {
          instanceId: 'greatsword',
          itemId: 'W06',
          position: { row: 0, column: 1 },
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'multi-cell',
      enemy: { initialCooldowns: [99] },
    })

    expect(state.player.items[1]?.modifiers.flatDamage).toBe(3)
  })

  it('matches target tags and snapshots crit, cooldown, and stamina modifiers', () => {
    const state = createCombatState({
      build: [
        {
          instanceId: 'whetstone',
          itemId: 'C04',
          position: { row: 0, column: 0 },
        },
        {
          instanceId: 'feather',
          itemId: 'C05',
          position: { row: 1, column: 0 },
        },
        {
          instanceId: 'glove',
          itemId: 'C02',
          position: { row: 2, column: 0 },
        },
        {
          instanceId: 'bow',
          itemId: 'W04',
          position: { row: 0, column: 1 },
        },
        {
          instanceId: 'herb',
          itemId: 'T01',
          position: { row: 0, column: 3 },
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'modifiers',
      enemy: { initialCooldowns: [99] },
    })

    const bow = state.player.items.find((item) => item.instanceId === 'bow')
    const herb = state.player.items.find((item) => item.instanceId === 'herb')

    expect(bow?.modifiers).toMatchObject({
      critChancePercent: 10,
      cooldownMultiplier: -0.1,
      staminaMultiplier: -0.1,
    })
    expect(bow?.cooldown).toBe(1.8)
    expect(bow?.staminaCost).toBe(0.45)
    expect(herb?.modifiers.critChancePercent).toBe(0)
  })

  it('lets C14 reach diagonal items while ordinary adjacency cannot', () => {
    const sageStoneState = createCombatState({
      build: [
        {
          instanceId: 'sage-stone',
          itemId: 'C14',
          position: { row: 0, column: 0 },
        },
        {
          instanceId: 'dagger',
          itemId: 'W01',
          position: { row: 1, column: 1 },
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'range-eight',
      enemy: { initialCooldowns: [99] },
    })
    const hourglassState = createCombatState({
      build: [
        {
          instanceId: 'hourglass',
          itemId: 'T06',
          position: { row: 0, column: 0 },
        },
        {
          instanceId: 'dagger',
          itemId: 'W01',
          position: { row: 1, column: 1 },
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'orthogonal',
      enemy: { initialCooldowns: [99] },
    })

    expect(sageStoneState.player.items[1]?.cooldown).toBe(0.9)
    expect(hourglassState.player.items[1]?.cooldown).toBe(1.2)
  })

  it('does not apply adjacency emitted by a sealed item', () => {
    const state = createCombatState({
      build: [
        {
          instanceId: 'sealed-statue',
          itemId: 'C10',
          position: { row: 0, column: 0 },
          sealed: true,
        },
        {
          instanceId: 'dagger',
          itemId: 'W01',
          position: { row: 0, column: 1 },
          initialCooldown: 0,
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'sealed-source',
      enemy: { hp: 100, initialCooldowns: [99] },
    })

    const tick = stepCombat(state)

    expect(tick.damages[0]?.amount).toBe(4)
    expect(tick.state.enemy.hp).toBe(96)
  })

  it('applies flat block and bottle effect multipliers to active effects', () => {
    const shieldState = createCombatState({
      build: [
        {
          instanceId: 'ore',
          itemId: 'C06',
          position: { row: 0, column: 0 },
        },
        {
          instanceId: 'lid',
          itemId: 'A04',
          position: { row: 0, column: 1 },
          initialCooldown: 0,
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'block-flat',
      enemy: { initialCooldowns: [99] },
    })
    const bottleState = createCombatState({
      build: [
        {
          instanceId: 'cauldron',
          itemId: 'T11',
          position: { row: 0, column: 0 },
        },
        {
          instanceId: 'poison-bottle',
          itemId: 'T05',
          position: { row: 0, column: 2 },
          initialCooldown: 0,
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'effect-multiplier',
      enemy: { initialCooldowns: [99] },
    })

    expect(stepCombat(shieldState).state.player.block).toBe(6)
    expect(stepCombat(bottleState).state.enemy.statuses.poisonStacks).toBe(3)
  })

  it('converts adjacent on-hit effects into deterministic target triggers', () => {
    const state = createCombatState({
      build: [
        {
          instanceId: 'ring',
          itemId: 'C09',
          position: { row: 0, column: 1 },
        },
        {
          instanceId: 'mushroom',
          itemId: 'C07',
          position: { row: 1, column: 0 },
        },
        {
          instanceId: 'dagger',
          itemId: 'W01',
          position: { row: 1, column: 1 },
          initialCooldown: 0,
        },
        {
          instanceId: 'midas-glove',
          itemId: 'E04',
          position: { row: 2, column: 1 },
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'adjacent-triggers',
      player: { maxHp: 100, hp: 90 },
      enemy: { hp: 100, initialCooldowns: [99] },
    })

    const tick = stepCombat(state)

    expect(tick.state.player.hp).toBe(91)
    expect(tick.state.enemy.statuses.poisonStacks).toBe(1)
    expect(tick.state.goldGained).toBe(1)
    expect(tick.triggerEvents.map((event) => event.effectType)).toEqual([
      'heal',
      'applyStatus',
      'gold',
    ])
  })
})
