import { createStore, type StoreApi } from 'zustand/vanilla'

import { gameConfig, items } from '../data'
import type { RunResult } from './run'

export const META_SNAPSHOT_VERSION = 1

const unlockableItems = items.filter((item) => !item.fusionOnly)
const unlockableItemIds = new Set(unlockableItems.map((item) => item.id))
const itemById = new Map(unlockableItems.map((item) => [item.id, item]))
const orderedUnlockableItemIds = unlockableItems.map((item) => item.id)
const initialUnlockedItemIds = unlockableItems
  .filter((item) => item.unlockCost === 0)
  .map((item) => item.id)

export interface MetaData {
  soulFragments: number
  unlockedItemIds: string[]
  maxUnlockedAbyssLevel: number
  claimedRunRewardKeys: string[]
}

export interface MetaSnapshot extends MetaData {
  version: typeof META_SNAPSHOT_VERSION
}

export interface MetaActions {
  unlockItem: (itemId: string) => void
  claimRunResult: (runSeed: string | number, result: RunResult, abyssLevel: number) => boolean
  loadSnapshot: (snapshot: MetaSnapshot) => void
  resetMeta: () => void
}

export type MetaStoreState = MetaData & MetaActions

function requireNonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer`)
  }
  return value
}

function createInitialData(): MetaData {
  return {
    soulFragments: 0,
    unlockedItemIds: [...initialUnlockedItemIds],
    maxUnlockedAbyssLevel: 0,
    claimedRunRewardKeys: [],
  }
}

function normalizeUnlockedItemIds(values: unknown): string[] {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) {
    throw new Error('unlockedItemIds must be an array of strings')
  }
  const unique = new Set<string>()
  for (const itemId of values) {
    if (!unlockableItemIds.has(itemId)) throw new Error(`Unknown unlockable item id: ${itemId}`)
    if (unique.has(itemId)) throw new Error(`Duplicate unlocked item id: ${itemId}`)
    unique.add(itemId)
  }
  for (const itemId of initialUnlockedItemIds) unique.add(itemId)
  return orderedUnlockableItemIds.filter((itemId) => unique.has(itemId))
}

function normalizeRewardKeys(values: unknown): string[] {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) {
    throw new Error('claimedRunRewardKeys must be an array of strings')
  }
  const unique = new Set<string>()
  for (const key of values) {
    if (key.trim().length === 0) throw new Error('claimedRunRewardKeys must not contain empty keys')
    if (unique.has(key)) throw new Error(`Duplicate claimed run reward key: ${key}`)
    unique.add(key)
  }
  return [...unique]
}

function dataFromSnapshot(snapshot: MetaSnapshot): MetaData {
  if (snapshot.version !== META_SNAPSHOT_VERSION) {
    throw new Error(`Unsupported meta snapshot version: ${snapshot.version}`)
  }
  const maxUnlockedAbyssLevel = requireNonNegativeInteger(
    snapshot.maxUnlockedAbyssLevel,
    'maxUnlockedAbyssLevel',
  )
  if (maxUnlockedAbyssLevel > gameConfig.abyss.maximumLevel) {
    throw new RangeError(`maxUnlockedAbyssLevel must be at most ${gameConfig.abyss.maximumLevel}`)
  }
  return {
    soulFragments: requireNonNegativeInteger(snapshot.soulFragments, 'soulFragments'),
    unlockedItemIds: normalizeUnlockedItemIds(snapshot.unlockedItemIds),
    maxUnlockedAbyssLevel,
    claimedRunRewardKeys: normalizeRewardKeys(snapshot.claimedRunRewardKeys),
  }
}

function cloneData(data: MetaData): MetaData {
  return {
    soulFragments: data.soulFragments,
    unlockedItemIds: [...data.unlockedItemIds],
    maxUnlockedAbyssLevel: data.maxUnlockedAbyssLevel,
    claimedRunRewardKeys: [...data.claimedRunRewardKeys],
  }
}

export function getRunRewardKey(
  runSeed: string | number,
  result: Pick<RunResult, 'outcome' | 'battlesWon' | 'reachedBattleCount'>,
): string {
  return `${String(runSeed)}:${result.outcome}:${result.battlesWon}:${result.reachedBattleCount}`
}

export function exportMetaSnapshot(state: MetaData): MetaSnapshot {
  return { version: META_SNAPSHOT_VERSION, ...cloneData(state) }
}

export function createMetaStore(snapshot?: MetaSnapshot): StoreApi<MetaStoreState> {
  const initialData = snapshot === undefined ? createInitialData() : dataFromSnapshot(snapshot)
  return createStore<MetaStoreState>()((set, get) => ({
    ...cloneData(initialData),

    unlockItem: (itemId) => {
      const state = get()
      const item = itemById.get(itemId)
      if (item === undefined) throw new Error(`Item cannot be unlocked: ${itemId}`)
      if (state.unlockedItemIds.includes(itemId)) return
      if (state.soulFragments < item.unlockCost) throw new Error('Not enough soul fragments')
      const unlocked = new Set([...state.unlockedItemIds, itemId])
      set({
        soulFragments: state.soulFragments - item.unlockCost,
        unlockedItemIds: orderedUnlockableItemIds.filter((id) => unlocked.has(id)),
      })
    },

    claimRunResult: (runSeed, result, abyssLevel) => {
      const state = get()
      const level = requireNonNegativeInteger(abyssLevel, 'abyssLevel')
      if (level > state.maxUnlockedAbyssLevel) {
        throw new Error('Cannot claim a result from a locked abyss level')
      }
      const key = getRunRewardKey(runSeed, result)
      if (state.claimedRunRewardKeys.includes(key)) return false
      const nextMax =
        result.outcome === 'cleared'
          ? Math.min(
              gameConfig.abyss.maximumLevel,
              Math.max(state.maxUnlockedAbyssLevel, level + 1),
            )
          : state.maxUnlockedAbyssLevel
      set({
        soulFragments: state.soulFragments + result.earnedSoulFragments,
        maxUnlockedAbyssLevel: nextMax,
        claimedRunRewardKeys: [...state.claimedRunRewardKeys, key],
      })
      return true
    },

    loadSnapshot: (nextSnapshot) => set(dataFromSnapshot(nextSnapshot)),
    resetMeta: () => set(createInitialData()),
  }))
}

export const metaStore = createMetaStore()
