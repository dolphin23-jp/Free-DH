import type { StoreApi } from 'zustand/vanilla'

import type { DropBatch } from '../engine/drops'
import { generateShopListing, type ShopListing } from '../engine/shop'
import {
  createCodexStore,
  exportCodexSnapshot,
  type CodexSnapshot,
  type CodexStoreState,
} from './codex'
import {
  dropProgressStore,
  type DropProgressState,
  type ReservedBossBonus,
} from './drop-progress'
import {
  createMetaStore,
  exportMetaSnapshot,
  metaStore,
  type MetaSnapshot,
  type MetaStoreState,
} from './meta'
import {
  calculateSoulFragments,
  createRunStore,
  exportRunSnapshot,
  type RunOutcome,
  type RunSnapshot,
  type RunStoreState,
} from './run'
import { shopStore, type ShopSessionState } from './shop'

export const GAME_SAVE_VERSION = 2

export interface DropProgressSnapshot {
  legendaryMissBattles: number
  pendingBatch: DropBatch | null
  reservedBossBonus: ReservedBossBonus | null
}

export interface ShopSessionSnapshot {
  listing: ShopListing | null
  purchasedSlots: number[]
  healUsed: boolean
  cursedChestPurchased: boolean
  gamblerPurchased: boolean
}

export interface GameSaveSnapshot {
  version: typeof GAME_SAVE_VERSION
  run: RunSnapshot
  codex: CodexSnapshot
  meta: MetaSnapshot
  dropProgress: DropProgressSnapshot
  shop: ShopSessionSnapshot
}

interface LegacyGameSaveV1 {
  version: 1
  run: Record<string, unknown>
  codex: CodexSnapshot
}

type LegacyShopListing = Omit<ShopListing, 'specials'> & {
  specials?: ShopListing['specials']
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function defaultMetaSnapshot(): MetaSnapshot {
  return exportMetaSnapshot(createMetaStore().getState())
}

function defaultDropProgressSnapshot(): DropProgressSnapshot {
  return { legendaryMissBattles: 0, pendingBatch: null, reservedBossBonus: null }
}

function defaultShopSnapshot(): ShopSessionSnapshot {
  return {
    listing: null,
    purchasedSlots: [],
    healUsed: false,
    cursedChestPurchased: false,
    gamblerPurchased: false,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function migrateRunSnapshot(candidate: Record<string, unknown>): RunSnapshot {
  if (candidate.version === 2) return candidate as unknown as RunSnapshot
  if (candidate.version !== 1) {
    throw new Error(`Unsupported run snapshot version: ${String(candidate.version)}`)
  }

  const battleIndex = typeof candidate.battleIndex === 'number' ? candidate.battleIndex : 0
  const battlesWon = typeof candidate.battlesWon === 'number' ? candidate.battlesWon : 0
  const abyssLevel = typeof candidate.abyssLevel === 'number' ? candidate.abyssLevel : 0
  const phase = candidate.phase
  const oldResult = isRecord(candidate.result) ? candidate.result : null
  const outcome: RunOutcome = oldResult?.outcome === 'cleared' ? 'cleared' : 'defeated'
  const currentHp = typeof candidate.currentHp === 'number' ? candidate.currentHp : 0
  const maxHp = typeof candidate.maxHp === 'number' ? candidate.maxHp : currentHp
  const gold = typeof candidate.gold === 'number' ? candidate.gold : 0
  const result =
    phase === 'result'
      ? {
          outcome,
          battlesWon,
          reachedBattleIndex: battleIndex,
          reachedBattleCount: battleIndex + 1,
          earnedSoulFragments: calculateSoulFragments(
            battleIndex + 1,
            abyssLevel,
            outcome === 'cleared',
          ),
          finalHp: currentHp,
          finalMaxHp: maxHp,
          finalGold: gold,
        }
      : null

  return {
    ...(candidate as unknown as Omit<RunSnapshot, 'version' | 'abyssLevel' | 'pendingBossReward' | 'result'>),
    version: 2,
    abyssLevel,
    pendingBossReward: null,
    result,
  }
}

export function migrateGameSave(candidate: unknown): GameSaveSnapshot {
  if (!isRecord(candidate)) throw new Error('Game save must be an object')
  if (candidate.version === GAME_SAVE_VERSION) return candidate as unknown as GameSaveSnapshot
  if (candidate.version !== 1) {
    throw new Error(`Unsupported game save version: ${String(candidate.version)}`)
  }
  const legacy = candidate as unknown as LegacyGameSaveV1
  return {
    version: GAME_SAVE_VERSION,
    run: migrateRunSnapshot(legacy.run),
    codex: legacy.codex,
    meta: defaultMetaSnapshot(),
    dropProgress: defaultDropProgressSnapshot(),
    shop: defaultShopSnapshot(),
  }
}

function validateDropProgress(snapshot: DropProgressSnapshot): DropProgressSnapshot {
  if (!Number.isInteger(snapshot.legendaryMissBattles) || snapshot.legendaryMissBattles < 0) {
    throw new Error('legendaryMissBattles must be a non-negative integer')
  }
  return cloneJson(snapshot)
}

function restoreShopListing(listing: ShopListing | null): ShopListing | null {
  if (listing === null) return null
  const candidate = listing as LegacyShopListing
  if (candidate.specials !== undefined) return cloneJson(candidate as ShopListing)
  return generateShopListing({
    runSeed: candidate.runSeed,
    battleIndex: candidate.battleIndex,
    rerollCount: candidate.rerollCount,
    area: candidate.area,
    abyssLevel: candidate.abyssLevel,
    ...(candidate.unlockedItemIds === undefined
      ? {}
      : { unlockedItemIds: candidate.unlockedItemIds }),
  })
}

function validateShop(snapshot: ShopSessionSnapshot): ShopSessionSnapshot {
  if (
    !Array.isArray(snapshot.purchasedSlots) ||
    snapshot.purchasedSlots.some((slot) => !Number.isInteger(slot) || slot < 0)
  ) {
    throw new Error('purchasedSlots must contain non-negative integers')
  }
  if (typeof snapshot.healUsed !== 'boolean') throw new Error('healUsed must be boolean')
  const cursedChestPurchased = snapshot.cursedChestPurchased ?? false
  const gamblerPurchased = snapshot.gamblerPurchased ?? false
  if (typeof cursedChestPurchased !== 'boolean') {
    throw new Error('cursedChestPurchased must be boolean')
  }
  if (typeof gamblerPurchased !== 'boolean') {
    throw new Error('gamblerPurchased must be boolean')
  }
  return {
    listing: restoreShopListing(snapshot.listing),
    purchasedSlots: [...snapshot.purchasedSlots],
    healUsed: snapshot.healUsed,
    cursedChestPurchased,
    gamblerPurchased,
  }
}

export function exportGameSave(
  runState: RunStoreState,
  codexState: CodexStoreState,
  metaState: MetaStoreState = metaStore.getState(),
  dropState: DropProgressState = dropProgressStore.getState(),
  shopState: ShopSessionState = shopStore.getState(),
): GameSaveSnapshot {
  return {
    version: GAME_SAVE_VERSION,
    run: exportRunSnapshot(runState),
    codex: exportCodexSnapshot(codexState),
    meta: exportMetaSnapshot(metaState),
    dropProgress: {
      legendaryMissBattles: dropState.legendaryMissBattles,
      pendingBatch: cloneJson(dropState.pendingBatch),
      reservedBossBonus: cloneJson(dropState.reservedBossBonus),
    },
    shop: {
      listing: cloneJson(shopState.listing),
      purchasedSlots: [...shopState.purchasedSlots],
      healUsed: shopState.healUsed,
      cursedChestPurchased: shopState.cursedChestPurchased,
      gamblerPurchased: shopState.gamblerPurchased,
    },
  }
}

export function loadGameSave(
  input: GameSaveSnapshot | unknown,
  run: StoreApi<RunStoreState>,
  codex: StoreApi<CodexStoreState>,
  meta: StoreApi<MetaStoreState> = metaStore,
  dropProgress: StoreApi<DropProgressState> = dropProgressStore,
  shop: StoreApi<ShopSessionState> = shopStore,
): GameSaveSnapshot {
  const snapshot = migrateGameSave(input)

  // Validate every section before mutating any live store.
  createRunStore(snapshot.run)
  createCodexStore(snapshot.codex)
  createMetaStore(snapshot.meta)
  const dropData = validateDropProgress(snapshot.dropProgress)
  const shopData = validateShop(snapshot.shop)

  run.getState().loadSnapshot(snapshot.run)
  codex.getState().loadSnapshot(snapshot.codex)
  meta.getState().loadSnapshot(snapshot.meta)
  dropProgress.setState(dropData)
  shop.setState(shopData)
  return { ...snapshot, shop: shopData }
}

export function stringifyGameSave(snapshot: GameSaveSnapshot): string {
  return JSON.stringify(snapshot, null, 2)
}

export function parseGameSaveJson(text: string): GameSaveSnapshot {
  return migrateGameSave(JSON.parse(text) as unknown)
}
