import { describe, expect, it } from 'vitest'

import { enemies } from '../src/data'
import { createCombatState, runTicks, stepCombat, type BuildItemInput } from '../src/engine/combat'
import { nextMulberry32, normalizeSeed } from '../src/engine/rng'

const noCritical = { critChancePercent: -100 }

function inactiveEnemy(enemyId: string, hp?: number) {
  return createCombatState({
    build: [],
    enemyId,
    seed: `inactive:${enemyId}`,
    player: { maxHp: 10_000, hp: 10_000 },
    enemy: { ...(hp === undefined ? {} : { hp }), initialCooldowns: [10_000] },
  })
}

describe('enemy traits', () => {
  it('regenerates HP and capped block on integer seconds', () => {
    const slimeState = inactiveEnemy('EN_A1_02', 50)
    slimeState.enemy.maxHp = 80
    const slime = runTicks(slimeState, 10)
    const gargoyle = runTicks(inactiveEnemy('EN_A2_04'), 10)

    expect(slime.enemy.hp).toBe(51)
    expect(gargoyle.enemy.block).toBe(4)
    expect(runTicks(gargoyle, 100).enemy.block).toBe(20)
  })

  it('revives once before allowing the skeleton to die', () => {
    let state = createCombatState({
      build: [
        {
          instanceId: 'greatsword',
          itemId: 'W06',
          position: { row: 0, column: 0 },
          initialCooldown: 0,
          resolvedModifiers: noCritical,
        },
      ],
      enemyId: 'EN_A2_01',
      seed: 'revive',
      enemy: { maxHp: 90, hp: 20, initialCooldowns: [99] },
    })

    state = stepCombat(state).state
    expect(state.result).toBe('ongoing')
    expect(state.enemy.hp).toBe(45)
    expect(state.enemy.reviveUsed).toBe(true)

    state.enemy.hp = 24
    state.player.items[0]!.cooldown = 0
    state = stepCombat(state).state
    expect(state.result).toBe('playerVictory')
  })

  it('lifesteals only HP damage and is disabled by burn', () => {
    const setup = (burn: boolean) =>
      createCombatState({
        build: [],
        enemyId: 'EN_A3_02',
        seed: `lifesteal:${burn}`,
        player: { block: 3 },
        enemy: {
          maxHp: 180,
          hp: 100,
          initialCooldowns: [0],
          ...(burn ? { statuses: { burnBatches: [{ stacks: 1, remainingSeconds: 3 }] } } : {}),
        },
      })

    expect(stepCombat(setup(false)).state.enemy.hp).toBe(105)
    expect(stepCombat(setup(true)).state.enemy.hp).toBe(100)
  })

  it('steals held gold and flees as a victory without returning it', () => {
    const final = runTicks(
      createCombatState({
        build: [],
        enemyId: 'EN_A1_03',
        seed: 'bandit-flee',
        player: { maxHp: 1_000, hp: 1_000, gold: 20 },
      }),
      200,
    )

    expect(final.result).toBe('playerVictory')
    expect(final.enemy.fled).toBe(true)
    expect(final.enemy.hitCount).toBe(8)
    expect(final.player.gold).toBe(0)
    expect(final.enemy.stolenGold).toBe(20)
    expect(final.goldGained).toBe(0)
  })

  it('returns stolen gold and the data-defined bonus when the bandit is killed', () => {
    let state = createCombatState({
      build: [
        {
          instanceId: 'dagger',
          itemId: 'W01',
          position: { row: 0, column: 0 },
          initialCooldown: 99,
          resolvedModifiers: noCritical,
        },
      ],
      enemyId: 'EN_A1_03',
      seed: 'bandit-kill',
      player: { maxHp: 1_000, hp: 1_000, gold: 20 },
    })

    state = runTicks(state, 32)
    expect(state.enemy.stolenGold).toBe(8)
    expect(state.player.gold).toBe(12)

    state.enemy.hp = 4
    state.player.items[0]!.cooldown = 0
    state = stepCombat(state).state

    expect(state.result).toBe('playerVictory')
    expect(state.player.gold).toBe(28)
    expect(state.goldGained).toBe(16)
    expect(state.enemy.stolenGold).toBe(0)
  })

  it('doubles wolf damage only while t is below three seconds', () => {
    const opening = createCombatState({
      build: [],
      enemyId: 'EN_A1_04',
      seed: 'opening-frenzy',
      enemy: { initialCooldowns: [0] },
    })
    expect(stepCombat(opening).damages[0]?.amount).toBe(10)

    const later = runTicks(inactiveEnemy('EN_A1_04'), 29)
    later.enemy.abilities[0]!.cooldown = 0
    expect(stepCombat(later).damages[0]?.amount).toBe(5)
  })

  it('adds cumulative enrage damage every six seconds', () => {
    const state = runTicks(inactiveEnemy('EN_A1_05'), 59)
    state.enemy.abilities[0]!.cooldown = 0
    const tick = stepCombat(state)

    expect(tick.state.enemy.enrageDamageBonus).toBe(1)
    expect(tick.damages[0]?.amount).toBe(5)
  })

  it('halves base stamina regeneration before equipment modifiers', () => {
    const state = createCombatState({
      build: [],
      enemyId: 'EN_A3_03',
      seed: 'stamina-drain',
      player: { stamina: 0 },
      enemy: { initialCooldowns: [99] },
    })

    const tick = stepCombat(state)
    expect(state.player.staminaRegenPerSecond).toBe(0.5)
    expect(tick.state.player.stamina).toBe(0.05)
  })

  it('reflects thorns once for a surviving normal attack hit', () => {
    const state = createCombatState({
      build: [
        {
          instanceId: 'dagger',
          itemId: 'W01',
          position: { row: 0, column: 0 },
          initialCooldown: 0,
          resolvedModifiers: noCritical,
        },
      ],
      enemyId: 'EN_A3_01',
      seed: 'thorns',
      enemy: { initialCooldowns: [99] },
    })

    const tick = stepCombat(state)
    expect(tick.state.enemy.hp).toBe(206)
    expect(tick.state.player.hp).toBe(97)
    expect(tick.damages[1]).toMatchObject({
      sourceId: 'EN_A3_01:trait:thorns',
      amount: 3,
      triggersAllowed: false,
    })
  })

  it('seals one physical item using the first battle RNG draw', () => {
    const seed = 'random-seal'
    const state = createCombatState({
      build: ['W01', 'W02', 'W03'].map((itemId, column) => ({
        instanceId: itemId,
        itemId,
        position: { row: 0, column },
      })),
      enemyId: 'EN_A2_03',
      seed,
      enemy: { initialCooldowns: [99] },
    })

    expect(state.player.items.filter((item) => item.sealed)).toHaveLength(1)
    expect(state.rngState).toBe(nextMulberry32(normalizeSeed(seed)).state)
  })

  it('transitions the demon king in the same tick and carries poison and burn', () => {
    const state = createCombatState({
      build: [
        {
          instanceId: 'piercing-spear',
          itemId: 'W12',
          position: { row: 0, column: 0 },
          initialCooldown: 0,
          resolvedModifiers: noCritical,
        },
      ],
      enemyId: 'EN_A3_05',
      seed: 'phase',
      enemy: {
        hp: 4,
        block: 3,
        initialCooldowns: [99],
        statuses: {
          poisonStacks: 5,
          burnBatches: [{ stacks: 2, remainingSeconds: 3 }],
          slowSeconds: 3,
        },
      },
    })

    const tick = stepCombat(state)
    expect(tick.state.result).toBe('ongoing')
    expect(tick.state.enemy.phaseIndex).toBe(1)
    expect(tick.state.enemy.hp).toBe(220)
    expect(tick.state.enemy.block).toBe(0)
    expect(tick.state.enemy.statuses.poisonStacks).toBe(5)
    expect(tick.state.enemy.statuses.burnBatches).toHaveLength(1)
    expect(tick.state.enemy.statuses.slowRemainingTicks).toBe(0)
    expect(tick.state.time).toBe(0.1)
  })

  it('allows poison damage itself to trigger the demon king phase transition', () => {
    const final = runTicks(
      createCombatState({
        build: [],
        enemyId: 'EN_A3_05',
        seed: 'poison-phase',
        enemy: {
          maxHp: 280,
          hp: 5,
          initialCooldowns: [99],
          statuses: { poisonStacks: 5 },
        },
      }),
      10,
    )

    expect(final.result).toBe('ongoing')
    expect(final.enemy.phaseIndex).toBe(1)
    expect(final.enemy.hp).toBe(220)
    expect(final.enemy.statuses.poisonStacks).toBe(5)
  })

  it('lets the player win sudden death when both sides have one HP', () => {
    const final = runTicks(
      createCombatState({
        build: [],
        enemyId: 'EN_A1_01',
        seed: 'sudden-death',
        player: { maxHp: 1, hp: 1 },
        enemy: { maxHp: 1, hp: 1, initialCooldowns: [99] },
      }),
      600,
    )

    expect(final.time).toBe(60)
    expect(final.result).toBe('playerVictory')
    expect(final.player.hp).toBe(1)
  })
})

describe('enemy reference battles', () => {
  const referenceBuild: readonly BuildItemInput[] = [
    {
      instanceId: 'hero-sword',
      itemId: 'E07',
      position: { row: 0, column: 0 },
      initialCooldown: 0,
      resolvedModifiers: noCritical,
    },
    {
      instanceId: 'siege-spear',
      itemId: 'F15',
      position: { row: 1, column: 0 },
      initialCooldown: 0,
      resolvedModifiers: noCritical,
    },
    {
      instanceId: 'plague-cauldron',
      itemId: 'F07',
      position: { row: 2, column: 0 },
      initialCooldown: 0,
    },
    {
      instanceId: 'greatshield',
      itemId: 'A10',
      position: { row: 3, column: 0 },
      initialCooldown: 0,
    },
  ]

  it.each(enemies.map((enemy) => [enemy.id, enemy.name] as const))(
    '%s %s reaches a deterministic result with the reference build',
    (enemyId) => {
      const final = runTicks(
        createCombatState({
          build: referenceBuild,
          enemyId,
          seed: `reference:${enemyId}`,
          player: { maxHp: 1_000, hp: 1_000 },
        }),
        600,
      )

      expect(final.result).toBe('playerVictory')
      expect(final.time).toBeLessThanOrEqual(60)
    },
  )
})
