import { afterEach, describe, expect, it } from 'vitest'

import { enemies, items } from '../src/data'
import { getAbyssEnemyModifiers, isEliteBattle, prepareAbyssEnemyDefinition } from '../src/engine/abyss'
import { generateDropBatch } from '../src/engine/drops'
import { createCodexStore, codexStore } from '../src/store/codex'
import { createDropProgressStore, dropProgressStore } from '../src/store/drop-progress'
import { createMetaStore, metaStore } from '../src/store/meta'
import {
  createGamePersistence,
  GAME_STORAGE_KEY,
  type GameStorage,
} from '../src/store/persistence'
import { createRunStore, runStore, type RunResult } from '../src/store/run'
import {
  exportGameSave,
  loadGameSave,
  migrateGameSave,
  parseGameSaveJson,
  stringifyGameSave,
} from '../src/store/save'
import { createShopStore, shopStore } from '../src/store/shop'

const clearResult: RunResult = {
  outcome: 'cleared',
  battlesWon: 15,
  reachedBattleIndex: 14,
  reachedBattleCount: 15,
  earnedSoulFragments: 25,
  finalHp: 50,
  finalMaxHp: 100,
  finalGold: 40,
}

function memoryStorage(): GameStorage & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  }
}

function resetGlobalStores(): void {
  runStore.getState().resetRun()
  codexStore.getState().resetCodex()
  metaStore.getState().resetMeta()
  dropProgressStore.getState().resetProgress()
  shopStore.getState().resetShop()
}

afterEach(() => resetGlobalStores())

describe('meta progression', () => {
  it('awards abyss 0 clear as 25 souls once and unlocks the next level', () => {
    const meta = createMetaStore()

    expect(meta.getState().claimRunResult('clear-seed', clearResult, 0)).toBe(true)
    expect(meta.getState().soulFragments).toBe(25)
    expect(meta.getState().maxUnlockedAbyssLevel).toBe(1)
    expect(meta.getState().claimRunResult('clear-seed', clearResult, 0)).toBe(false)
    expect(meta.getState().soulFragments).toBe(25)
  })

  it('spends item unlockCost and adds the item to the permanent pool', () => {
    const meta = createMetaStore()
    meta.getState().claimRunResult('unlock-seed', clearResult, 0)

    expect(meta.getState().unlockedItemIds).not.toContain('W11')
    meta.getState().unlockItem('W11')
    expect(meta.getState().unlockedItemIds).toContain('W11')
    expect(meta.getState().soulFragments).toBe(10)
  })

  it('never emits locked items from deterministic drop generation', () => {
    const unlocked = createMetaStore().getState().unlockedItemIds
    const unlockedSet = new Set(unlocked)

    for (let battleIndex = 0; battleIndex < 15; battleIndex += 1) {
      const batch = generateDropBatch({
        runSeed: 'locked-pool-test',
        battleIndex,
        area: (Math.floor(battleIndex / 5) + 1) as 1 | 2 | 3,
        isBoss: battleIndex % 5 === 4,
        legendaryMissBattles: battleIndex,
        unlockedItemIds: unlocked,
      })
      expect(batch.drops.every((drop) => unlockedSet.has(drop.itemId))).toBe(true)
    }

    const lockedIds = items
      .filter((item) => !item.fusionOnly && item.unlockCost > 0)
      .map((item) => item.id)
    expect(lockedIds.some((itemId) => unlockedSet.has(itemId))).toBe(false)
  })
})

describe('abyss scaling', () => {
  it('applies configured HP and attack coefficients without compounding', () => {
    const enemy = enemies.find((candidate) => candidate.id === 'EN_A1_01')
    if (enemy === undefined || !('hp' in enemy)) throw new Error('Expected a standard enemy')
    prepareAbyssEnemyDefinition(enemy.id, 0, false)
    const baseHp = enemy.hp
    const baseDamage = enemy.abilities[0]!.effects.find((effect) => effect.type === 'damage')?.value
    if (baseDamage === undefined) throw new Error('Expected a damage effect')

    const modifiers = prepareAbyssEnemyDefinition(enemy.id, 2, true)
    expect(enemy.hp).toBeCloseTo(baseHp * modifiers.hpMultiplier)
    expect(enemy.abilities[0]!.effects.find((effect) => effect.type === 'damage')?.value)
      .toBeCloseTo(baseDamage * modifiers.attackMultiplier)

    prepareAbyssEnemyDefinition(enemy.id, 1, false)
    const levelOne = getAbyssEnemyModifiers(1, false)
    expect(enemy.hp).toBeCloseTo(baseHp * levelOne.hpMultiplier)
    expect(enemy.abilities[0]!.effects.find((effect) => effect.type === 'damage')?.value)
      .toBeCloseTo(baseDamage * levelOne.attackMultiplier)
  })

  it('selects exactly one deterministic regular elite per area from level 3', () => {
    for (let area = 0; area < 3; area += 1) {
      const indices = Array.from({ length: 4 }, (_unused, local) => area * 5 + local)
      expect(indices.filter((index) => isEliteBattle('elite-seed', index, 3))).toHaveLength(1)
      expect(indices.filter((index) => isEliteBattle('elite-seed', index, 2))).toHaveLength(0)
      expect(isEliteBattle('elite-seed', area * 5 + 4, 10)).toBe(false)
    }
  })
})

describe('versioned full saves', () => {
  it('round-trips run, codex, meta, pity, pending drops, and shop state', () => {
    const run = createRunStore()
    const codex = createCodexStore()
    const meta = createMetaStore()
    const drops = createDropProgressStore()
    const shop = createShopStore()

    run.getState().startRun('save-roundtrip', undefined, 0)
    codex.getState().discoverItems(['W01'])
    codex.getState().discoverEnemy('EN_A1_01')
    meta.getState().claimRunResult('past-clear', clearResult, 0)
    const unlocked = meta.getState().unlockedItemIds
    drops.getState().prepareBatch({
      runSeed: 'save-roundtrip',
      battleIndex: 0,
      area: 1,
      isBoss: false,
      unlockedItemIds: unlocked,
    })
    shop.getState().prepareShop({
      runSeed: 'save-roundtrip',
      battleIndex: 0,
      area: 1,
      abyssLevel: 0,
      unlockedItemIds: unlocked,
    })
    shop.getState().markPurchased(0)

    const snapshot = exportGameSave(
      run.getState(),
      codex.getState(),
      meta.getState(),
      drops.getState(),
      shop.getState(),
    )
    const parsed = parseGameSaveJson(stringifyGameSave(snapshot))

    const restoredRun = createRunStore()
    const restoredCodex = createCodexStore()
    const restoredMeta = createMetaStore()
    const restoredDrops = createDropProgressStore()
    const restoredShop = createShopStore()
    loadGameSave(parsed, restoredRun, restoredCodex, restoredMeta, restoredDrops, restoredShop)

    expect(
      exportGameSave(
        restoredRun.getState(),
        restoredCodex.getState(),
        restoredMeta.getState(),
        restoredDrops.getState(),
        restoredShop.getState(),
      ),
    ).toEqual(snapshot)
  })

  it('migrates version 1 game saves with default meta progression', () => {
    const run = createRunStore()
    const codex = createCodexStore()
    const current = exportGameSave(run.getState(), codex.getState())
    const migrated = migrateGameSave({ version: 1, run: current.run, codex: current.codex })

    expect(migrated.version).toBe(2)
    expect(migrated.meta.soulFragments).toBe(0)
    expect(migrated.meta.maxUnlockedAbyssLevel).toBe(0)
    expect(migrated.dropProgress.legendaryMissBattles).toBe(0)
    expect(migrated.shop.listing).toBeNull()
  })

  it('persists and reloads the complete save through the local storage controller', () => {
    resetGlobalStores()
    const storage = memoryStorage()
    const writer = createGamePersistence(storage)
    metaStore.getState().claimRunResult('stored-clear', clearResult, 0)
    runStore.getState().startRun('stored-run', undefined, 1)
    writer.save()
    writer.dispose()

    resetGlobalStores()
    expect(metaStore.getState().soulFragments).toBe(0)
    const reader = createGamePersistence(storage)
    reader.load()
    reader.dispose()

    expect(storage.values.has(GAME_STORAGE_KEY)).toBe(true)
    expect(metaStore.getState().soulFragments).toBe(25)
    expect(metaStore.getState().maxUnlockedAbyssLevel).toBe(1)
    expect(runStore.getState().runSeed).toBe('stored-run')
    expect(runStore.getState().abyssLevel).toBe(1)
  })
})
