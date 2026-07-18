import { describe, expect, it } from 'vitest'

import { createCombatState, runTicks, stepCombat } from '../src/engine/combat'

describe('status effects', () => {
  it('applies poison True damage only on integer seconds', () => {
    const initial = createCombatState({
      build: [],
      enemyId: 'EN_A1_01',
      seed: 'status-timing',
      enemy: {
        hp: 100,
        block: 20,
        initialCooldowns: [99],
        statuses: { poisonStacks: 2 },
      },
    })

    const beforeIntegerSecond = runTicks(initial, 9)
    expect(beforeIntegerSecond.enemy.hp).toBe(100)
    expect(beforeIntegerSecond.enemy.block).toBe(20)

    const integerSecond = stepCombat(beforeIntegerSecond)
    expect(integerSecond.state.time).toBe(1)
    expect(integerSecond.state.enemy.hp).toBe(98)
    expect(integerSecond.state.enemy.block).toBe(20)
    expect(integerSecond.damages).toEqual([
      expect.objectContaining({
        sourceId: 'status:poison',
        amount: 2,
        hpDamage: 2,
        trueDamage: true,
        triggersAllowed: false,
      }),
    ])
  })

  it('expires burn batches independently after their own three-second windows', () => {
    const initial = createCombatState({
      build: [],
      enemyId: 'EN_A1_01',
      seed: 'burn-batches',
      enemy: {
        hp: 100,
        initialCooldowns: [99],
        statuses: {
          burnBatches: [
            { stacks: 2, remainingSeconds: 1 },
            { stacks: 3, remainingSeconds: 3 },
          ],
        },
      },
    })

    const firstSecond = runTicks(initial, 10)
    expect(firstSecond.enemy.hp).toBe(95)
    expect(firstSecond.enemy.statuses.burnBatches).toEqual([{ stacks: 3, remainingTicks: 20 }])

    const secondSecond = runTicks(firstSecond, 10)
    expect(secondSecond.enemy.hp).toBe(92)
    expect(secondSecond.enemy.statuses.burnBatches).toEqual([{ stacks: 3, remainingTicks: 10 }])

    const thirdSecond = runTicks(secondSecond, 10)
    expect(thirdSecond.enemy.hp).toBe(89)
    expect(thirdSecond.enemy.statuses.burnBatches).toEqual([])
  })

  it('resolves Player status damage before Enemy status damage', () => {
    const initial = createCombatState({
      build: [],
      enemyId: 'EN_A1_01',
      seed: 'status-order',
      player: { hp: 1, statuses: { poisonStacks: 1 } },
      enemy: { hp: 1, initialCooldowns: [99], statuses: { poisonStacks: 1 } },
    })

    const result = runTicks(initial, 10)
    expect(result.result).toBe('playerDefeat')
    expect(result.player.hp).toBe(0)
    expect(result.enemy.hp).toBe(1)
  })

  it('marks status True damage as non-reactive so reflect cannot respond', () => {
    const initial = createCombatState({
      build: [
        {
          instanceId: 'thorn-shield',
          itemId: 'A06',
          position: { row: 0, column: 0 },
          initialCooldown: 99,
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'no-reflect',
      player: { block: 30, statuses: { poisonStacks: 2 } },
      enemy: { hp: 100, initialCooldowns: [99] },
    })
    const initialRngState = initial.rngState

    const beforeDamage = runTicks(initial, 9)
    const tick = stepCombat(beforeDamage)

    expect(tick.state.player.hp).toBe(98)
    expect(tick.state.player.block).toBe(30)
    expect(tick.state.enemy.hp).toBe(100)
    expect(tick.state.rngState).toBe(initialRngState)
    expect(tick.damages[0]).toMatchObject({
      trueDamage: true,
      triggersAllowed: false,
      blocked: 0,
      pierce: true,
    })
  })

  it('slows cooldown progress from 0.1 to 0.08 per tick', () => {
    const initial = createCombatState({
      build: [],
      enemyId: 'EN_A1_01',
      seed: 'slow',
      enemy: { initialCooldowns: [1], statuses: { slowSeconds: 1 } },
    })

    const tick = stepCombat(initial)
    expect(tick.state.enemy.abilities[0]?.cooldown).toBe(0.92)
    expect(tick.state.enemy.statuses.slowRemainingTicks).toBe(9)
  })

  it('lets Holy Water cleanse poison and every burn batch without removing slow', () => {
    const initial = createCombatState({
      build: [
        {
          instanceId: 'holy-water',
          itemId: 'T07',
          position: { row: 0, column: 0 },
          initialCooldown: 0,
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'cleanse',
      player: {
        statuses: {
          poisonStacks: 3,
          burnBatches: [
            { stacks: 1, remainingSeconds: 1 },
            { stacks: 2, remainingSeconds: 2 },
          ],
          slowSeconds: 1,
        },
      },
      enemy: { initialCooldowns: [99] },
    })

    const tick = stepCombat(initial)
    expect(tick.activations).toContainEqual({ side: 'player', sourceId: 'holy-water' })
    expect(tick.state.player.statuses.poisonStacks).toBe(0)
    expect(tick.state.player.statuses.burnBatches).toEqual([])
    expect(tick.state.player.statuses.slowRemainingTicks).toBe(9)
  })

  it('applies poison effects from item data and ticks them later', () => {
    const initial = createCombatState({
      build: [
        {
          instanceId: 'poison-bottle',
          itemId: 'T05',
          position: { row: 0, column: 0 },
          initialCooldown: 0,
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'apply-poison',
      enemy: { hp: 100, initialCooldowns: [99] },
    })

    const applied = stepCombat(initial)
    expect(applied.state.enemy.statuses.poisonStacks).toBe(2)

    const firstIntegerSecond = runTicks(applied.state, 9)
    expect(firstIntegerSecond.enemy.hp).toBe(98)
  })
})
