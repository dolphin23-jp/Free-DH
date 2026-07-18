import { describe, expect, it } from 'vitest'

import { gameConfig } from '../src/data'
import { generateDropBatch } from '../src/engine/drops'
import {
  createDropProgressStore,
  type DropProgressStorage,
} from '../src/store/drop-progress'

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

const bossRequest = {
  runSeed: 'boss-reward-stream',
  battleIndex: 4,
  area: 1 as const,
  isBoss: true,
  abyssLevel: 0,
  dropLuckPercent: 0,
}

describe('boss reward drop reservation', () => {
  it('splits one deterministic drops stream into three base and two optional slots', () => {
    const store = createDropProgressStore()
    const primary = store.getState().prepareBossBatch(bossRequest)
    const reserved = store.getState().reservedBossBonus
    const full = generateDropBatch({
      ...bossRequest,
      additionalSlots: gameConfig.bossChoice.additionalDropSlots,
      legendaryMissBattles: 0,
    })

    expect(primary.drops).toHaveLength(gameConfig.drops.bossSlots)
    expect(reserved?.batch.drops).toHaveLength(gameConfig.bossChoice.additionalDropSlots)
    expect([...primary.drops, ...(reserved?.batch.drops ?? [])]).toEqual(full.drops)
    expect(reserved?.batch.streamSeed).toBe(primary.streamSeed)
    expect(reserved?.batch.key).toBe(`${primary.key}:bonus`)
  })

  it('activates the reserved batch only after the primary batch is cleared', () => {
    const store = createDropProgressStore()
    const primary = store.getState().prepareBossBatch(bossRequest)

    expect(() => store.getState().activateBossBonus(primary.key)).toThrow(
      'current drop batch must be resolved',
    )
    store.getState().clearPendingBatch(primary.key)
    const bonus = store.getState().activateBossBonus(primary.key)

    expect(store.getState().pendingBatch).toEqual(bonus)
    expect(store.getState().reservedBossBonus).toBeNull()
    expect(bonus.key).toBe(`${primary.key}:bonus`)
  })

  it('persists a reserved boss bonus and can discard it for the healing choice', () => {
    const storage = new MemoryStorage()
    const store = createDropProgressStore(storage)
    const primary = store.getState().prepareBossBatch(bossRequest)
    store.getState().clearPendingBatch(primary.key)

    const restored = createDropProgressStore(storage)
    expect(restored.getState().reservedBossBonus?.baseKey).toBe(primary.key)
    restored.getState().discardBossBonus(primary.key)

    const discarded = createDropProgressStore(storage)
    expect(discarded.getState().reservedBossBonus).toBeNull()
    expect(discarded.getState().pendingBatch).toBeNull()
  })
})
