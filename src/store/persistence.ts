import { codexStore } from './codex'
import { dropProgressStore } from './drop-progress'
import { metaStore } from './meta'
import { runStore } from './run'
import {
  exportGameSave,
  loadGameSave,
  parseGameSaveJson,
  stringifyGameSave,
  type GameSaveSnapshot,
} from './save'
import { shopStore } from './shop'

export const GAME_STORAGE_KEY = 'free-dh:game-save:v2'

export interface GameStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

function getBrowserStorage(): GameStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

export function getCurrentGameSave(): GameSaveSnapshot {
  return exportGameSave(
    runStore.getState(),
    codexStore.getState(),
    metaStore.getState(),
    dropProgressStore.getState(),
    shopStore.getState(),
  )
}

export function exportCurrentGameSaveJson(): string {
  return stringifyGameSave(getCurrentGameSave())
}

export function importCurrentGameSaveJson(text: string): GameSaveSnapshot {
  const snapshot = parseGameSaveJson(text)
  return loadGameSave(snapshot, runStore, codexStore, metaStore, dropProgressStore, shopStore)
}

export interface GamePersistenceController {
  load: () => GameSaveSnapshot | null
  save: () => GameSaveSnapshot
  clear: () => void
  dispose: () => void
}

export function createGamePersistence(storage: GameStorage | undefined): GamePersistenceController {
  let hydrating = false
  let disposed = false

  const save = (): GameSaveSnapshot => {
    const snapshot = getCurrentGameSave()
    if (storage !== undefined && !disposed) {
      storage.setItem(GAME_STORAGE_KEY, stringifyGameSave(snapshot))
    }
    return snapshot
  }

  const load = (): GameSaveSnapshot | null => {
    if (storage === undefined || disposed) return null
    const raw = storage.getItem(GAME_STORAGE_KEY)
    if (raw === null) return null
    hydrating = true
    try {
      const snapshot = importCurrentGameSaveJson(raw)
      storage.setItem(GAME_STORAGE_KEY, stringifyGameSave(snapshot))
      return snapshot
    } finally {
      hydrating = false
    }
  }

  const onStoreChange = () => {
    if (!hydrating && !disposed) save()
  }
  const unsubscribers = [
    runStore.subscribe(onStoreChange),
    codexStore.subscribe(onStoreChange),
    metaStore.subscribe(onStoreChange),
    dropProgressStore.subscribe(onStoreChange),
    shopStore.subscribe(onStoreChange),
  ]

  return {
    load,
    save,
    clear: () => storage?.removeItem(GAME_STORAGE_KEY),
    dispose: () => {
      disposed = true
      unsubscribers.forEach((unsubscribe) => unsubscribe())
    },
  }
}

let browserController: GamePersistenceController | null = null

export function initializeBrowserPersistence(): GamePersistenceController | null {
  if (browserController !== null) return browserController
  const storage = getBrowserStorage()
  if (storage === undefined) return null
  browserController = createGamePersistence(storage)
  try {
    const loaded = browserController.load()
    if (loaded === null) browserController.save()
  } catch {
    browserController.clear()
    browserController.save()
  }
  return browserController
}
