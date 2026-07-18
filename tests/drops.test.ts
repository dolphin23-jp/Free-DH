import { describe, expect, it } from 'vitest'

import { affixPool, gameConfig, items } from '../src/data'
import {
  buildRarityDistribution,
  generateDropBatch,
  getLegendaryPityBonusPercent,
  getPityAfterDrops,
  type DropGenerationRequest,
} from '../src/engine/drops'
import {
  createDropProgressStore,
  type DropProgressStorage,
} from '../src/store/drop-progress'

const baseRequest: Omit<DropGenerationRequest, 'legendaryMissBattles'> = {
  runSeed: 'drop-test',
  battleIndex: 3,
  area: 1,
  isBoss: false,
  abyssLevel: 0,
  dropLuckPercent: 0,
}

class MemoryStorage implements DropProgressStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

function affixMatchesItem(affixId: string, itemId: string): boolean {
  const affix = affixPool.find((candidate) => candidate.id === affixId)
  const item = items.find((candidate) => candidate.id === itemId)
  if (affix === undefined || item === undefined) return false
  if (affix.target === 'any') return true
  if (affix.target === 'weapon') return item.tags.includes('weapon')
  if (affix.target === 'shield') return item.tags.includes('shield')
  return item.cooldown !== undefined
}

describe('drop rarity distribution', () => {
  it('moves abyss, drop-luck, and pity percentages from common rarity', () => {
    expect(getLegendaryPityBonusPercent(29)).toBe(0)
    expect(getLegendaryPityBonusPercent(30)).toBe(1)
    expect(getLegendaryPityBonusPercent(31)).toBe(2)

    expect(buildRarityDistribution(1, 2, 1, 30)).toEqual({
      common: 44,
      uncommon: 30,
      rare: 16,
      epic: 6.4,
      legendary: 3.6,
    })
  })

  it('resets the pity counter on any legendary and increments once per missed battle', () => {
    expect(getPityAfterDrops(29, [{ rarity: 'rare' }, { rarity: 'epic' }])).toBe(30)
    expect(getPityAfterDrops(30, [{ rarity: 'common' }, { rarity: 'legendary' }])).toBe(0)
  })
})

describe('deterministic drop stream', () => {
  it('returns the exact same batch for the same run seed and battle index', () => {
    const first = generateDropBatch({ ...baseRequest, legendaryMissBattles: 12 })
    const second = generateDropBatch({ ...baseRequest, legendaryMissBattles: 12 })

    expect(second).toEqual(first)
    expect(
      generateDropBatch({
        ...baseRequest,
        battleIndex: baseRequest.battleIndex + 1,
        legendaryMissBattles: 12,
      }).streamSeed,
    ).not.toBe(first.streamSeed)
  })

  it('uses two normal slots and three boss slots from config', () => {
    expect(
      generateDropBatch({ ...baseRequest, legendaryMissBattles: 0 }).drops,
    ).toHaveLength(gameConfig.drops.normalSlots)
    expect(
      generateDropBatch({
        ...baseRequest,
        isBoss: true,
        legendaryMissBattles: 0,
      }).drops,
    ).toHaveLength(gameConfig.drops.bossSlots)
  })

  it('assigns rarity-appropriate unique affixes that match the item target', () => {
    for (let battleIndex = 0; battleIndex < 50; battleIndex += 1) {
      const batch = generateDropBatch({
        runSeed: 'affix-sweep',
        battleIndex,
        area: 3,
        isBoss: true,
        abyssLevel: 10,
        dropLuckPercent: 1,
        legendaryMissBattles: battleIndex,
      })

      for (const drop of batch.drops) {
        const rule = gameConfig.drops.affixesPerRarity[drop.rarity]
        expect(drop.affixIds.length).toBeGreaterThanOrEqual(rule.minimum)
        expect(drop.affixIds.length).toBeLessThanOrEqual(rule.maximum)
        expect(new Set(drop.affixIds).size).toBe(drop.affixIds.length)
        for (const affixId of drop.affixIds) {
          expect(affixMatchesItem(affixId, drop.itemId)).toBe(true)
        }
      }
    }
  })
})

describe('persistent drop progress', () => {
  it('processes one battle key once and restores the pending batch and pity across stores', () => {
    const storage = new MemoryStorage()
    const store = createDropProgressStore(storage)
    const first = store.getState().prepareBatch(baseRequest)
    const pityAfterFirst = store.getState().legendaryMissBattles
    const duplicate = store.getState().prepareBatch(baseRequest)

    expect(duplicate).toEqual(first)
    expect(store.getState().legendaryMissBattles).toBe(pityAfterFirst)

    const restored = createDropProgressStore(storage)
    expect(restored.getState().pendingBatch).toEqual(first)
    expect(restored.getState().legendaryMissBattles).toBe(pityAfterFirst)
  })

  it('resets persisted pity when a legendary appears after the threshold', () => {
    const storage = new MemoryStorage()
    const store = createDropProgressStore(storage)
    store.setState({ legendaryMissBattles: 30, pendingBatch: null })

    let legendaryRequest: Omit<DropGenerationRequest, 'legendaryMissBattles'> | null = null
    for (let index = 0; index < 10_000; index += 1) {
      const candidate = {
        ...baseRequest,
        runSeed: `legendary-search-${index}`,
        battleIndex: index,
        area: 3 as const,
        isBoss: true,
      }
      const batch = generateDropBatch({ ...candidate, legendaryMissBattles: 30 })
      if (batch.drops.some((drop) => drop.rarity === 'legendary')) {
        legendaryRequest = candidate
        break
      }
    }

    expect(legendaryRequest).not.toBeNull()
    const batch = store.getState().prepareBatch(legendaryRequest!)
    expect(batch.drops.some((drop) => drop.rarity === 'legendary')).toBe(true)
    expect(store.getState().legendaryMissBattles).toBe(0)

    const restored = createDropProgressStore(storage)
    expect(restored.getState().legendaryMissBattles).toBe(0)
  })
})
