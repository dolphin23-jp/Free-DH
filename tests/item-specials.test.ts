import { describe, expect, it } from 'vitest'

import { createCombatState, getPlayerDropLuck, stepCombat } from '../src/engine/combat'

const noCritical = { critChancePercent: -100 }

describe('item special keywords', () => {
  it('readies openingShot items before the first activation phase', () => {
    const state = createCombatState({
      build: [
        {
          instanceId: 'opening-bow',
          itemId: 'W04',
          position: { row: 0, column: 0 },
          initialCooldown: 99,
          resolvedModifiers: noCritical,
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'opening-shot',
      enemy: { hp: 100, initialCooldowns: [99] },
    })

    const tick = stepCombat(state)

    expect(tick.activations).toEqual([{ side: 'player', sourceId: 'opening-bow' }])
    expect(tick.damages[0]?.amount).toBe(6)
  })

  it('applies execute at exactly half of enemy maximum HP', () => {
    const state = createCombatState({
      build: [
        {
          instanceId: 'execution-axe',
          itemId: 'W11',
          position: { row: 0, column: 0 },
          initialCooldown: 0,
          resolvedModifiers: noCritical,
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'execute',
      enemy: { maxHp: 100, hp: 50, initialCooldowns: [99] },
    })

    expect(stepCombat(state).damages[0]?.amount).toBe(45)
  })

  it('increments battleScalingDamage after each hit for the current battle', () => {
    const state = createCombatState({
      build: [
        {
          instanceId: 'dragon-sword',
          itemId: 'W14',
          position: { row: 0, column: 0 },
          initialCooldown: 0,
          resolvedModifiers: noCritical,
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'battle-scaling',
      enemy: { hp: 100, initialCooldowns: [99] },
    })

    const first = stepCombat(state)
    const sword = first.state.player.items[0]
    if (sword === undefined) {
      throw new Error('dragon sword state is missing')
    }
    sword.cooldown = 0
    const second = stepCombat(first.state)

    expect(first.damages[0]?.amount).toBe(14)
    expect(second.damages[0]?.amount).toBe(15)
    expect(second.state.player.items[0]?.battleDamageBonus).toBe(2)
  })

  it('persists runScalingDamage through the item input/output boundary', () => {
    const firstState = createCombatState({
      build: [
        {
          instanceId: 'hero-sword',
          itemId: 'E07',
          position: { row: 0, column: 0 },
          initialCooldown: 0,
          runDamageBonus: 0.4,
          resolvedModifiers: noCritical,
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'run-scaling-one',
      enemy: { hp: 100, initialCooldowns: [99] },
    })

    const first = stepCombat(firstState)
    const carriedBonus = first.state.player.items[0]?.runDamageBonus
    const nextState = createCombatState({
      build: [
        {
          instanceId: 'hero-sword',
          itemId: 'E07',
          position: { row: 0, column: 0 },
          initialCooldown: 0,
          runDamageBonus: carriedBonus,
          resolvedModifiers: noCritical,
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'run-scaling-two',
      enemy: { hp: 100, initialCooldowns: [99] },
    })

    expect(first.damages[0]?.amount).toBe(12.4)
    expect(carriedBonus).toBe(0.6)
    expect(stepCombat(nextState).damages[0]?.amount).toBe(12.6)
  })

  it('adds poisonFinisher stacks times its coefficient in the additive stage', () => {
    const state = createCombatState({
      build: [
        {
          instanceId: 'poison-scythe',
          itemId: 'W15',
          position: { row: 0, column: 0 },
          initialCooldown: 0,
          resolvedModifiers: noCritical,
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'poison-finisher',
      enemy: {
        hp: 100,
        initialCooldowns: [99],
        statuses: { poisonStacks: 5 },
      },
    })

    expect(stepCombat(state).damages[0]?.amount).toBe(35)
  })

  it('fires guardianHeal once when HP crosses below 30 percent', () => {
    const state = createCombatState({
      build: [
        {
          instanceId: 'world-tree-drop',
          itemId: 'T12',
          position: { row: 0, column: 0 },
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'guardian-heal',
      player: { maxHp: 100, hp: 31 },
      enemy: { initialCooldowns: [0] },
    })

    const tick = stepCombat(state)

    expect(tick.state.player.hp).toBe(68)
    expect(tick.triggerEvents).toContainEqual({
      sourceSide: 'player',
      sourceId: 'world-tree-drop',
      trigger: 'hpBelow',
      effectType: 'heal',
      value: 40,
      depth: 1,
    })
  })

  it('seals the first available adjacent item in up-left-right-down order', () => {
    const state = createCombatState({
      build: [
        {
          instanceId: 'idol',
          itemId: 'C12',
          position: { row: 2, column: 2 },
        },
        {
          instanceId: 'down',
          itemId: 'W01',
          position: { row: 3, column: 2 },
        },
        {
          instanceId: 'right',
          itemId: 'W01',
          position: { row: 2, column: 3 },
        },
        {
          instanceId: 'left',
          itemId: 'W01',
          position: { row: 2, column: 1 },
        },
        {
          instanceId: 'up',
          itemId: 'W01',
          position: { row: 1, column: 2 },
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'seal-adjacent',
      enemy: { initialCooldowns: [99] },
    })

    const sealedIds = state.player.items
      .filter((item) => item.sealed)
      .map((item) => item.instanceId)

    expect(sealedIds).toEqual(['up'])
  })

  it('duplicates the highest rarity adjacent item and breaks ties by grid order', () => {
    const state = createCombatState({
      build: [
        {
          instanceId: 'royal-chest',
          itemId: 'C13',
          position: { row: 2, column: 2 },
        },
        {
          instanceId: 'common-dagger',
          itemId: 'W01',
          position: { row: 1, column: 2 },
          resolvedModifiers: noCritical,
        },
        {
          instanceId: 'right-poison',
          itemId: 'T09',
          position: { row: 2, column: 4 },
        },
        {
          instanceId: 'left-assassin',
          itemId: 'W10',
          position: { row: 2, column: 1 },
          initialCooldown: 0,
          resolvedModifiers: noCritical,
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'duplicate-adjacent',
      enemy: { hp: 100, initialCooldowns: [99] },
    })

    const duplicate = state.player.items.find((item) => item.virtual)
    const tick = stepCombat(state)

    expect(duplicate).toMatchObject({
      itemId: 'W10',
      duplicateOfInstanceId: 'left-assassin',
      duplicatedByInstanceId: 'royal-chest',
    })
    expect(duplicate).not.toBe(
      state.player.items.find((item) => item.instanceId === 'left-assassin'),
    )
    expect(tick.activations.slice(0, 2).map((activation) => activation.sourceId)).toEqual([
      'left-assassin',
      'royal-chest:duplicate:left-assassin',
    ])
  })

  it('readies every active item with readyAllCooldowns', () => {
    const state = createCombatState({
      build: [
        {
          instanceId: 'time-hourglass',
          itemId: 'E08',
          position: { row: 0, column: 0 },
        },
        {
          instanceId: 'dagger',
          itemId: 'W01',
          position: { row: 0, column: 1 },
          initialCooldown: 99,
          resolvedModifiers: noCritical,
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'ready-all',
      enemy: { hp: 100, initialCooldowns: [99] },
    })

    expect(stepCombat(state).activations).toContainEqual({
      side: 'player',
      sourceId: 'dagger',
    })
  })

  it('persists runMaxHpOnKill on player state after victory', () => {
    const state = createCombatState({
      build: [
        {
          instanceId: 'blood-grail',
          itemId: 'C11',
          position: { row: 0, column: 0 },
        },
        {
          instanceId: 'dagger',
          itemId: 'W01',
          position: { row: 0, column: 1 },
          initialCooldown: 0,
          resolvedModifiers: noCritical,
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'run-max-hp',
      player: { maxHp: 100, hp: 90 },
      enemy: { hp: 4, initialCooldowns: [99] },
    })

    const tick = stepCombat(state)

    expect(tick.state.result).toBe('playerVictory')
    expect(tick.state.player.maxHp).toBe(103)
    expect(tick.state.player.hp).toBe(90)
  })

  it('exposes active, unsealed dropLuck for the drop system', () => {
    const active = createCombatState({
      build: [
        {
          instanceId: 'lucky-pendant',
          itemId: 'F10',
          position: { row: 0, column: 0 },
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'drop-luck-active',
    })
    const sealed = createCombatState({
      build: [
        {
          instanceId: 'lucky-pendant',
          itemId: 'F10',
          position: { row: 0, column: 0 },
          sealed: true,
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'drop-luck-sealed',
    })

    expect(getPlayerDropLuck(active)).toBe(1)
    expect(getPlayerDropLuck(sealed)).toBe(0)
  })

  it('heals a percentage of maximum HP on battleWin', () => {
    const state = createCombatState({
      build: [
        {
          instanceId: 'ouroboros',
          itemId: 'F18',
          position: { row: 0, column: 0 },
        },
        {
          instanceId: 'dagger',
          itemId: 'W01',
          position: { row: 0, column: 1 },
          initialCooldown: 0,
          resolvedModifiers: noCritical,
        },
      ],
      enemyId: 'EN_A1_01',
      seed: 'heal-on-win',
      player: { maxHp: 100, hp: 50 },
      enemy: { hp: 4, initialCooldowns: [99] },
    })

    expect(stepCombat(state).state.player.hp).toBe(75)
  })

  it('applies undeadSlayer only to enemies tagged undead', () => {
    const build = [
      {
        instanceId: 'holy-sword',
        itemId: 'F02',
        position: { row: 0, column: 0 },
        initialCooldown: 0,
        resolvedModifiers: noCritical,
      },
    ] as const
    const undead = createCombatState({
      build,
      enemyId: 'EN_A2_01',
      seed: 'undead-slayer',
      enemy: { hp: 100, initialCooldowns: [99] },
    })
    const living = createCombatState({
      build,
      enemyId: 'EN_A1_01',
      seed: 'ordinary-target',
      enemy: { hp: 100, initialCooldowns: [99] },
    })

    expect(stepCombat(undead).damages[0]?.amount).toBe(24)
    expect(stepCombat(living).damages[0]?.amount).toBe(12)
  })
})
