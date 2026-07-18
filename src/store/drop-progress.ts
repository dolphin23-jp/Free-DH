import { createStore, type StoreApi } from 'zustand/vanilla'

import { gameConfig } from '../data'
import {
  generateDropBatch,
  getPityAfterDrops,
  type DropBatch,
  type DropGenerationRequest,
} from '../engine/drops'

export const DROP_PROGRESS_STORAGE_KEY = 'free-dh:drop-progress:v1'

export interface ReservedBossBonus {
  baseKey: string
  batch: DropBatch
  pityAfter: number
}

export interface DropProgressData {
  legendaryMissBattles: number
  pendingBatch: DropBatch | null
  reservedBossBonus: ReservedBossBonus | null
}

export interface DropProgressActions {
  prepareBatch: (request: Omit<DropGenerationRequest, 'legendaryMissBattles'>) => DropBatch
  prepareBossBatch: (
    request: Omit<DropGenerationRequest, 'legendaryMissBattles' | 'additionalSlots'>,
  ) => DropBatch
  activateBossBonus: (baseKey: string) => DropBatch
  discardBossBonus: (baseKey: string) => void
  clearPendingBatch: (key: string) => void
  resetProgress: () => void
}

export type DropProgressState = DropProgressData & DropProgressActions

export interface DropProgressStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

interface PersistedDropProgressV1 {
  version: 1
  legendaryMissBattles: number
  pendingBatch: DropBatch | null
}

interface PersistedDropProgressV2 {
  version: 2
  legendaryMissBattles: number
  pendingBatch: DropBatch | null
  reservedBossBonus: ReservedBossBonus | null
}

function createInitialData(): DropProgressData {
  return { legendaryMissBattles: 0, pendingBatch: null, reservedBossBonus: null }
}

function isDropBatch(value: unknown): value is DropBatch {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<DropBatch>
  return (
    typeof candidate.key === 'string' &&
    typeof candidate.streamSeed === 'number' &&
    Number.isInteger(candidate.battleIndex) &&
    typeof candidate.pityBefore === 'number' &&
    typeof candidate.pityAfter === 'number' &&
    Array.isArray(candidate.drops)
  )
}

function isReservedBossBonus(value: unknown): value is ReservedBossBonus {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<ReservedBossBonus>
  return (
    typeof candidate.baseKey === 'string' &&
    isDropBatch(candidate.batch) &&
    Number.isInteger(candidate.pityAfter) &&
    (candidate.pityAfter ?? -1) >= 0
  )
}

function validPity(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0
}

function readPersisted(storage: DropProgressStorage | undefined): DropProgressData {
  if (storage === undefined) return createInitialData()

  try {
    const raw = storage.getItem(DROP_PROGRESS_STORAGE_KEY)
    if (raw === null) return createInitialData()
    const parsed = JSON.parse(raw) as Partial<PersistedDropProgressV1 & PersistedDropProgressV2>
    if (
      !validPity(parsed.legendaryMissBattles) ||
      (parsed.pendingBatch !== null && parsed.pendingBatch !== undefined && !isDropBatch(parsed.pendingBatch))
    ) {
      return createInitialData()
    }
    if (parsed.version === 1) {
      return {
        legendaryMissBattles: parsed.legendaryMissBattles,
        pendingBatch: parsed.pendingBatch ?? null,
        reservedBossBonus: null,
      }
    }
    if (
      parsed.version !== 2 ||
      (parsed.reservedBossBonus !== null &&
        parsed.reservedBossBonus !== undefined &&
        !isReservedBossBonus(parsed.reservedBossBonus))
    ) {
      return createInitialData()
    }
    return {
      legendaryMissBattles: parsed.legendaryMissBattles,
      pendingBatch: parsed.pendingBatch ?? null,
      reservedBossBonus: parsed.reservedBossBonus ?? null,
    }
  } catch {
    return createInitialData()
  }
}

function writePersisted(storage: DropProgressStorage | undefined, data: DropProgressData): void {
  if (storage === undefined) return
  const payload: PersistedDropProgressV2 = {
    version: 2,
    legendaryMissBattles: data.legendaryMissBattles,
    pendingBatch: data.pendingBatch,
    reservedBossBonus: data.reservedBossBonus,
  }
  storage.setItem(DROP_PROGRESS_STORAGE_KEY, JSON.stringify(payload))
}

function getBrowserStorage(): DropProgressStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

function bossBonusKey(baseKey: string): string {
  return `${baseKey}:bonus`
}

export function createDropProgressStore(
  storage: DropProgressStorage | undefined = undefined,
): StoreApi<DropProgressState> {
  const initial = readPersisted(storage)

  return createStore<DropProgressState>()((set, get) => ({
    ...initial,

    prepareBatch: (request) => {
      const current = get()
      const key = `${String(request.runSeed)}:${request.battleIndex}`
      if (current.pendingBatch?.key === key) return current.pendingBatch

      const batch = generateDropBatch({
        ...request,
        legendaryMissBattles: current.legendaryMissBattles,
      })
      const next: DropProgressData = {
        legendaryMissBattles: batch.pityAfter,
        pendingBatch: batch,
        reservedBossBonus: null,
      }
      set(next)
      writePersisted(storage, next)
      return batch
    },

    prepareBossBatch: (request) => {
      const current = get()
      const baseKey = `${String(request.runSeed)}:${request.battleIndex}`
      if (current.pendingBatch?.key === baseKey) return current.pendingBatch

      const fullBatch = generateDropBatch({
        ...request,
        isBoss: true,
        additionalSlots: gameConfig.bossChoice.additionalDropSlots,
        legendaryMissBattles: current.legendaryMissBattles,
      })
      const primaryCount = fullBatch.drops.length - gameConfig.bossChoice.additionalDropSlots
      const primaryDrops = fullBatch.drops.slice(0, primaryCount)
      const bonusDrops = fullBatch.drops.slice(primaryCount)
      const primaryPityAfter = getPityAfterDrops(current.legendaryMissBattles, primaryDrops)
      const primaryBatch: DropBatch = {
        ...fullBatch,
        drops: primaryDrops,
        pityAfter: primaryPityAfter,
      }
      const bonusBatch: DropBatch = {
        ...fullBatch,
        key: bossBonusKey(baseKey),
        pityBefore: primaryPityAfter,
        drops: bonusDrops,
      }
      const reservedBossBonus: ReservedBossBonus = {
        baseKey,
        batch: bonusBatch,
        pityAfter: fullBatch.pityAfter,
      }
      const next: DropProgressData = {
        legendaryMissBattles: primaryPityAfter,
        pendingBatch: primaryBatch,
        reservedBossBonus,
      }
      set(next)
      writePersisted(storage, next)
      return primaryBatch
    },

    activateBossBonus: (baseKey) => {
      const current = get()
      if (current.pendingBatch !== null) {
        throw new Error('The current drop batch must be resolved before boss bonus drops')
      }
      const reserved = current.reservedBossBonus
      if (reserved === null || reserved.baseKey !== baseKey) {
        throw new Error(`Reserved boss bonus not found: ${baseKey}`)
      }
      const next: DropProgressData = {
        legendaryMissBattles: reserved.pityAfter,
        pendingBatch: reserved.batch,
        reservedBossBonus: null,
      }
      set(next)
      writePersisted(storage, next)
      return reserved.batch
    },

    discardBossBonus: (baseKey) => {
      const current = get()
      if (current.reservedBossBonus?.baseKey !== baseKey) return
      const next: DropProgressData = {
        legendaryMissBattles: current.legendaryMissBattles,
        pendingBatch: current.pendingBatch,
        reservedBossBonus: null,
      }
      set(next)
      writePersisted(storage, next)
    },

    clearPendingBatch: (key) => {
      const current = get()
      if (current.pendingBatch?.key !== key) return
      const next: DropProgressData = {
        legendaryMissBattles: current.legendaryMissBattles,
        pendingBatch: null,
        reservedBossBonus: current.reservedBossBonus,
      }
      set(next)
      writePersisted(storage, next)
    },

    resetProgress: () => {
      const next = createInitialData()
      set(next)
      if (storage !== undefined) storage.removeItem(DROP_PROGRESS_STORAGE_KEY)
    },
  }))
}

export const dropProgressStore = createDropProgressStore(getBrowserStorage())
