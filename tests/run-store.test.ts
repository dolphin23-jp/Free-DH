import { describe, expect, it } from 'vitest'

import { gameConfig } from '../src/data'
import { fork } from '../src/engine/rng'
import {
  RUN_BATTLE_COUNT,
  calculateSoulFragments,
  createEnemyOrder,
  createRunStore,
  expandBagForBossReward,
  exportRunSnapshot,
  getAvailableBossExpansionChoices,
  getCurrentBattleSeed,
  getCurrentEnemyId,
  selectCurrentCombatSetup,
  type BossExpansionChoice,
  type RunBagState,
  type RunInventorySnapshot,
} from '../src/store'

const initialInventory: RunInventorySnapshot = {
  bag: {
    columns: 4,
    rows: 3,
    items: [
      {
        instanceId: 'dragon-sword',
        itemId: 'W14',
        affixIds: ['AF01'],
        rotated: false,
        runDamageBonus: 0,
        position: { row: 0, column: 0 },
      },
    ],
  },
  storage: {
    capacity: 8,
    items: [
      {
        instanceId: 'stored-charm',
        itemId: 'C01',
        affixIds: [],
        rotated: false,
        runDamageBonus: 0,
      },
    ],
  },
}

const bossExpansionByBattle = new Map<number, BossExpansionChoice>([
  [4, 'column'],
  [9, 'row'],
  [14, 'column'],
])

describe('run enemy order', () => {
  it('uses deterministic per-area streams and places each boss fifth', () => {
    expect(createEnemyOrder('run-alpha')).toEqual([
      'EN_A1_01',
      'EN_A1_04',
      'EN_A1_03',
      'EN_A1_02',
      'EN_A1_05',
      'EN_A2_02',
      'EN_A2_01',
      'EN_A2_04',
      'EN_A2_03',
      'EN_A2_05',
      'EN_A3_02',
      'EN_A3_01',
      'EN_A3_04',
      'EN_A3_03',
      'EN_A3_05',
    ])
    expect(createEnemyOrder('run-alpha')).toEqual(createEnemyOrder('run-alpha'))
    expect(createEnemyOrder('run-alpha')).not.toEqual(createEnemyOrder('run-beta'))
  })
})

describe('boss bag expansion', () => {
  it('supports the acceptance sequence 4x3 to 5x3 to 5x4 to 6x4', () => {
    let bag: RunBagState = { columns: 4, rows: 3, items: [] }
    expect(getAvailableBossExpansionChoices(bag)).toEqual(['column', 'row'])

    bag = expandBagForBossReward(bag, 'column')
    expect(bag).toMatchObject({ columns: 5, rows: 3 })

    bag = expandBagForBossReward(bag, 'row')
    expect(bag).toMatchObject({ columns: 5, rows: 4 })

    bag = expandBagForBossReward(bag, 'column')
    expect(bag).toMatchObject({ columns: 6, rows: 4 })
    expect(getAvailableBossExpansionChoices(bag)).toEqual([])
  })

  it('allows alternate choices while respecting the configured 6x4 boss maximum', () => {
    let bag: RunBagState = { columns: 4, rows: 3, items: [] }
    bag = expandBagForBossReward(bag, 'row')
    expect(bag).toMatchObject({ columns: 4, rows: 4 })
    expect(getAvailableBossExpansionChoices(bag)).toEqual(['column'])
    expect(() => expandBagForBossReward(bag, 'row')).toThrow('Boss expansion row is not available')
  })
})

describe('soul fragment result calculation', () => {
  it('matches the specified clear and abyss examples', () => {
    expect(calculateSoulFragments(15, 0, true)).toBe(25)
    expect(calculateSoulFragments(10, 2, false)).toBe(14)
  })
})

describe('run state machine', () => {
  it('moves through fifteen victories, three boss rewards, and the clear result', () => {
    const store = createRunStore()
    const initial = store.getState()

    expect(initial.phase).toBe('idle')
    expect(initial.currentHp).toBe(gameConfig.player.initialHp)
    expect(initial.gold).toBe(gameConfig.player.initialGold)

    initial.startRun('full-clear')

    for (let battleIndex = 0; battleIndex < RUN_BATTLE_COUNT; battleIndex += 1) {
      const beforeBattle = store.getState()
      expect(beforeBattle.phase).toBe('preBattle')
      expect(beforeBattle.battleIndex).toBe(battleIndex)
      expect(getCurrentEnemyId(beforeBattle)).toBe(beforeBattle.enemyOrder[battleIndex])
      expect(getCurrentBattleSeed(beforeBattle)).toBe(fork('full-clear', `battle:${battleIndex}`))

      beforeBattle.beginBattle()
      expect(store.getState().phase).toBe('battle')

      store.getState().completeBattle({
        result: 'playerVictory',
        playerHp: 100 - battleIndex,
        playerMaxHp: 100,
        playerGold: 16 + battleIndex,
      })

      const expansion = bossExpansionByBattle.get(battleIndex)
      if (expansion !== undefined) {
        expect(store.getState().phase).toBe('bossReward')
        if (battleIndex === 9) {
          store.getState().claimBossReward(expansion, 'additionalDrops')
          expect(store.getState().phase).toBe('bossReward')
          expect(store.getState().pendingBossReward).toMatchObject({
            expansionChoice: expansion,
            benefitChoice: 'additionalDrops',
          })
          store.getState().completeBossBonusDrops()
        } else {
          store.getState().claimBossReward(expansion, 'heal')
        }
      }
    }

    const final = store.getState()
    expect(final.phase).toBe('result')
    expect(final.battleIndex).toBe(14)
    expect(final.battlesWon).toBe(15)
    expect(final.bag).toMatchObject({ columns: 6, rows: 4 })
    expect(final.result).toEqual({
      outcome: 'cleared',
      battlesWon: 15,
      reachedBattleIndex: 14,
      reachedBattleCount: 15,
      earnedSoulFragments: 25,
      finalHp: 100,
      finalMaxHp: 100,
      finalGold: 30,
    })
    expect(getCurrentEnemyId(final)).toBeNull()
  })

  it('ends immediately with a defeat result while preserving reached battle and souls', () => {
    const store = createRunStore()
    store.getState().startRun('defeat-run')

    for (let index = 0; index < 2; index += 1) {
      store.getState().beginBattle()
      store.getState().completeBattle({
        result: 'playerVictory',
        playerHp: 90 - index * 10,
        playerMaxHp: 100,
        playerGold: 20 + index,
      })
    }

    store.getState().beginBattle()
    store.getState().completeBattle({
      result: 'playerDefeat',
      playerHp: 0,
      playerMaxHp: 100,
      playerGold: 21,
    })

    const final = store.getState()
    expect(final.phase).toBe('result')
    expect(final.battleIndex).toBe(2)
    expect(final.battlesWon).toBe(2)
    expect(final.result).toMatchObject({
      outcome: 'defeated',
      battlesWon: 2,
      reachedBattleIndex: 2,
      reachedBattleCount: 3,
      earnedSoulFragments: 3,
      finalHp: 0,
    })
  })

  it('carries HP, gold, inventory, abyss, and run-scaling damage across a reload snapshot', () => {
    const store = createRunStore()
    store.getState().startRun('reload-run', initialInventory, 2)

    const firstSetup = selectCurrentCombatSetup(store.getState())
    expect(firstSetup).toMatchObject({
      enemyId: store.getState().enemyOrder[0],
      player: { hp: 100, maxHp: 100, gold: 15 },
    })
    expect(firstSetup?.build[0]).toMatchObject({
      instanceId: 'dragon-sword',
      itemId: 'W14',
      runDamageBonus: 0,
      position: { row: 0, column: 0 },
    })

    store.getState().beginBattle()
    store.getState().completeBattle({
      result: 'playerVictory',
      playerHp: 83,
      playerMaxHp: 105,
      playerGold: 27,
      runDamageBonusByInstanceId: { 'dragon-sword': 0.2 },
    })

    const serialized = JSON.parse(JSON.stringify(exportRunSnapshot(store.getState()))) as ReturnType<
      typeof exportRunSnapshot
    >
    const restored = createRunStore(serialized)
    const restoredState = restored.getState()

    expect(restoredState.phase).toBe('preBattle')
    expect(restoredState.abyssLevel).toBe(2)
    expect(restoredState.battleIndex).toBe(1)
    expect(restoredState.currentHp).toBe(83)
    expect(restoredState.maxHp).toBe(105)
    expect(restoredState.gold).toBe(27)
    expect(restoredState.bag.items[0]?.runDamageBonus).toBe(0.2)
    expect(restoredState.storage.items).toEqual(initialInventory.storage.items)

    expect(selectCurrentCombatSetup(restoredState)).toMatchObject({
      enemyId: restoredState.enemyOrder[1],
      player: { hp: 83, maxHp: 105, gold: 27 },
      build: [{ instanceId: 'dragon-sword', runDamageBonus: 0.2 }],
    })

    restoredState.beginBattle()
    expect(() => restored.getState().replaceInventory(initialInventory)).toThrow(
      'Inventory cannot change during battle',
    )
  })

  it('restores both unclaimed and additional-drop boss reward states', () => {
    const store = createRunStore()
    store.getState().startRun('boss-reload')

    for (let battleIndex = 0; battleIndex <= 4; battleIndex += 1) {
      store.getState().beginBattle()
      store.getState().completeBattle({
        result: 'playerVictory',
        playerHp: 70,
        playerMaxHp: 100,
        playerGold: 20,
      })
    }

    expect(store.getState().phase).toBe('bossReward')
    const unclaimed = createRunStore(exportRunSnapshot(store.getState()))
    expect(unclaimed.getState().pendingBossReward).toEqual({
      battleIndex: 4,
      expansionChoice: null,
      benefitChoice: null,
    })

    unclaimed.getState().claimBossReward('column', 'additionalDrops')
    const claimed = createRunStore(exportRunSnapshot(unclaimed.getState()))
    expect(claimed.getState().bag).toMatchObject({ columns: 5, rows: 3 })
    expect(claimed.getState().pendingBossReward).toMatchObject({
      expansionChoice: 'column',
      benefitChoice: 'additionalDrops',
    })

    claimed.getState().completeBossBonusDrops()
    expect(claimed.getState()).toMatchObject({
      phase: 'preBattle',
      battleIndex: 5,
      pendingBossReward: null,
    })
  })

  it('rejects invalid transitions', () => {
    const store = createRunStore()
    expect(() => store.getState().beginBattle()).toThrow('beginBattle requires phase preBattle')
    expect(() => store.getState().claimBossReward('column', 'heal')).toThrow(
      'claimBossReward requires phase bossReward',
    )

    store.getState().startRun('invalid-transition')
    expect(() =>
      store.getState().completeBattle({
        result: 'playerVictory',
        playerHp: 100,
        playerMaxHp: 100,
        playerGold: 15,
      }),
    ).toThrow('completeBattle requires phase battle')
  })
})
