import { createStore, type StoreApi } from 'zustand/vanilla'

import { enemies, items, recipes, type RuntimeEnemy } from '../data'

export const CODEX_SNAPSHOT_VERSION = 1

const orderedItemIds = items.map((item) => item.id)
const orderedEnemyIds = enemies.map((enemy) => enemy.id)
const orderedRecipeIds = recipes.map((recipe) => recipe.id)
const itemIdSet = new Set(orderedItemIds)
const enemyIdSet = new Set(orderedEnemyIds)
const recipeIdSet = new Set(orderedRecipeIds)
const enemyById = new Map(enemies.map((enemy) => [enemy.id, enemy]))

export interface CodexData {
  discoveredItemIds: string[]
  discoveredEnemyIds: string[]
  discoveredRecipeIds: string[]
}

export interface CodexSnapshot extends CodexData {
  version: typeof CODEX_SNAPSHOT_VERSION
}

export interface CodexActions {
  discoverItems: (itemIds: readonly string[]) => void
  discoverEnemy: (enemyId: string) => void
  discoverRecipe: (recipeId: string) => void
  loadSnapshot: (snapshot: CodexSnapshot) => void
  resetCodex: () => void
}

export type CodexStoreState = CodexData & CodexActions

export type EnemyPreview =
  | {
      discovered: false
      id: string
      name: '???'
      hint: string
      area: number
      isBoss: boolean
    }
  | {
      discovered: true
      id: string
      name: string
      hint: string
      area: number
      isBoss: boolean
      enemy: RuntimeEnemy
    }

function createEmptyCodex(): CodexData {
  return {
    discoveredItemIds: [],
    discoveredEnemyIds: [],
    discoveredRecipeIds: [],
  }
}

function validateKnownIds(
  values: unknown,
  knownIds: ReadonlySet<string>,
  orderedIds: readonly string[],
  label: string,
): string[] {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) {
    throw new Error(`${label} must be an array of strings`)
  }

  const unique = new Set<string>()
  for (const id of values) {
    if (!knownIds.has(id)) throw new Error(`${label} contains unknown id: ${id}`)
    if (unique.has(id)) throw new Error(`${label} contains duplicate id: ${id}`)
    unique.add(id)
  }

  return orderedIds.filter((id) => unique.has(id))
}

function dataFromSnapshot(snapshot: CodexSnapshot): CodexData {
  if (snapshot.version !== CODEX_SNAPSHOT_VERSION) {
    throw new Error(`Unsupported codex snapshot version: ${snapshot.version}`)
  }

  return {
    discoveredItemIds: validateKnownIds(
      snapshot.discoveredItemIds,
      itemIdSet,
      orderedItemIds,
      'discoveredItemIds',
    ),
    discoveredEnemyIds: validateKnownIds(
      snapshot.discoveredEnemyIds,
      enemyIdSet,
      orderedEnemyIds,
      'discoveredEnemyIds',
    ),
    discoveredRecipeIds: validateKnownIds(
      snapshot.discoveredRecipeIds,
      recipeIdSet,
      orderedRecipeIds,
      'discoveredRecipeIds',
    ),
  }
}

function mergeKnownIds(
  current: readonly string[],
  incoming: readonly string[],
  knownIds: ReadonlySet<string>,
  orderedIds: readonly string[],
  label: string,
): string[] {
  const merged = new Set(current)
  for (const id of incoming) {
    if (!knownIds.has(id)) throw new Error(`Unknown ${label} id: ${id}`)
    merged.add(id)
  }
  return orderedIds.filter((id) => merged.has(id))
}

function cloneCodex(data: CodexData): CodexData {
  return {
    discoveredItemIds: [...data.discoveredItemIds],
    discoveredEnemyIds: [...data.discoveredEnemyIds],
    discoveredRecipeIds: [...data.discoveredRecipeIds],
  }
}

export function getEnemyPreview(
  enemyId: string,
  discoveredEnemyIds: readonly string[],
): EnemyPreview {
  const enemy = enemyById.get(enemyId)
  if (enemy === undefined) throw new Error(`Unknown enemy id: ${enemyId}`)

  if (!discoveredEnemyIds.includes(enemyId)) {
    return {
      discovered: false,
      id: enemy.id,
      name: '???',
      hint: enemy.hint,
      area: enemy.area,
      isBoss: enemy.isBoss,
    }
  }

  return {
    discovered: true,
    id: enemy.id,
    name: enemy.name,
    hint: enemy.hint,
    area: enemy.area,
    isBoss: enemy.isBoss,
    enemy,
  }
}

export function exportCodexSnapshot(state: CodexData): CodexSnapshot {
  return { version: CODEX_SNAPSHOT_VERSION, ...cloneCodex(state) }
}

export function createCodexStore(snapshot?: CodexSnapshot): StoreApi<CodexStoreState> {
  const initialData = snapshot === undefined ? createEmptyCodex() : dataFromSnapshot(snapshot)

  return createStore<CodexStoreState>()((set) => ({
    ...cloneCodex(initialData),

    discoverItems: (itemIds) =>
      set((state) => ({
        discoveredItemIds: mergeKnownIds(
          state.discoveredItemIds,
          itemIds,
          itemIdSet,
          orderedItemIds,
          'item',
        ),
      })),

    discoverEnemy: (enemyId) =>
      set((state) => ({
        discoveredEnemyIds: mergeKnownIds(
          state.discoveredEnemyIds,
          [enemyId],
          enemyIdSet,
          orderedEnemyIds,
          'enemy',
        ),
      })),

    discoverRecipe: (recipeId) =>
      set((state) => ({
        discoveredRecipeIds: mergeKnownIds(
          state.discoveredRecipeIds,
          [recipeId],
          recipeIdSet,
          orderedRecipeIds,
          'recipe',
        ),
      })),

    loadSnapshot: (nextSnapshot) => set(dataFromSnapshot(nextSnapshot)),
    resetCodex: () => set(createEmptyCodex()),
  }))
}

export const codexStore = createCodexStore()
