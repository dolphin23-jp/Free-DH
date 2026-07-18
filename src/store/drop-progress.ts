import { createStore, type StoreApi } from 'zustand/vanilla'

import {
  generateDropBatch,
  type DropBatch,
  type DropGenerationRequest,
} from '../engine/drops'

export const DROP_PROGRESS_STORAGE_KEY = 'free-dh:drop-progress:v1'

export interface DropProgressData {
  legendaryMissBattles: number
  pendingBatch: DropBatch | null
}

export interface DropProgressActions {
  prepareBatch: (request: Omit<DropGenerationRequest, 'legendaryMissBattles'>) => DropBatch
  clearPendingBatch: (key: string) => void
  resetProgress: () => void
}

export type DropProgressState = DropProgressData & DropProgressActions

export interface DropProgressStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

interface PersistedDropProgress {
  version: 1
  legendaryMissBattles: number
  pendingBatch: DropBatch | null
}

function createInitialData(): DropProgressData {
  return { legendaryMissBattles: 0, pendingBatch: null }
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

function readPersisted(storage: DropProgressStorage | undefined): DropProgressData {
  if (storage === undefined) return createInitialData()

  try {
    const raw = storage.getItem(DROP_PROGRESS_STORAGE_KEY)
    if (raw === null) return createInitialData()
    const parsed = JSON.parse(raw) as Partial<PersistedDropProgress>
    if (
      parsed.version !== 1 ||
      !Number.isInteger(parsed.legendaryMissBattles) ||
      (parsed.legendaryMissBattles ?? -1) < 0 ||
      (parsed.pendingBatch !== null && !isDropBatch(parsed.pendingBatch))
    ) {
      return createInitialData()
    }
    return {
      legendaryMissBattles: parsed.legendaryMissBattles!,
      pendingBatch: parsed.pendingBatch ?? null,
    }
  } catch {
    return createInitialData()
  }
}

function writePersisted(storage: DropProgressStorage | undefined, data: DropProgressData): void {
  if (storage === undefined) return
  const payload: PersistedDropProgress = {
    version: 1,
    legendaryMissBattles: data.legendaryMissBattles,
    pendingBatch: data.pendingBatch,
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
      }
      set(next)
      writePersisted(storage, next)
      return batch
    },

    clearPendingBatch: (key) => {
      const current = get()
      if (current.pendingBatch?.key !== key) return
      const next: DropProgressData = {
        legendaryMissBattles: current.legendaryMissBattles,
        pendingBatch: null,
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
