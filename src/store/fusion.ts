import { items, recipes, type Recipe } from '../data'
import { areItemsAdjacent, type GridPosition } from '../engine/adjacency'
import { canPlaceBagItem, cloneInventory, getItemDefinition } from './bag'
import type {
  RunBagItem,
  RunBagState,
  RunInventoryItem,
  RunInventorySnapshot,
} from './run'

export interface FusionCandidate {
  recipeId: string
  firstInstanceId: string
  secondInstanceId: string
  firstItemId: string
  secondItemId: string
  resultItemId: string
}

export interface FusionResult {
  inventory: RunInventorySnapshot
  recipe: Recipe
  resultItem: RunBagItem
}

const itemIdSet = new Set(items.map((item) => item.id))
const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]))
const recipeByPair = new Map<string, Recipe>()

function pairKey(firstItemId: string, secondItemId: string): string {
  return [firstItemId, secondItemId].sort().join('+')
}

for (const recipe of recipes) {
  const key = pairKey(recipe.a, recipe.b)
  if (recipeByPair.has(key)) throw new Error(`Duplicate fusion ingredient pair: ${key}`)
  if (!itemIdSet.has(recipe.result)) throw new Error(`Unknown fusion result item: ${recipe.result}`)
  recipeByPair.set(key, recipe)
}

function compareBagItems(left: RunBagItem, right: RunBagItem): number {
  return (
    left.position.row - right.position.row ||
    left.position.column - right.position.column ||
    left.instanceId.localeCompare(right.instanceId)
  )
}

function placementOf(item: RunBagItem) {
  return {
    position: item.position,
    size: getItemDefinition(item.itemId).size,
    rotated: item.rotated,
  }
}

function candidateFromPair(first: RunBagItem, second: RunBagItem): FusionCandidate | null {
  const recipe = recipeByPair.get(pairKey(first.itemId, second.itemId))
  if (recipe === undefined) return null
  return {
    recipeId: recipe.id,
    firstInstanceId: first.instanceId,
    secondInstanceId: second.instanceId,
    firstItemId: first.itemId,
    secondItemId: second.itemId,
    resultItemId: recipe.result,
  }
}

export function matchFusionRecipe(firstItemId: string, secondItemId: string): Recipe | null {
  return recipeByPair.get(pairKey(firstItemId, secondItemId)) ?? null
}

export function findFusionCandidates(bag: RunBagState): FusionCandidate[] {
  const orderedItems = [...bag.items].sort(compareBagItems)
  const candidates: FusionCandidate[] = []

  for (let firstIndex = 0; firstIndex < orderedItems.length; firstIndex += 1) {
    const first = orderedItems[firstIndex]!
    for (let secondIndex = firstIndex + 1; secondIndex < orderedItems.length; secondIndex += 1) {
      const second = orderedItems[secondIndex]!
      if (!areItemsAdjacent(placementOf(first), placementOf(second))) continue
      const candidate = candidateFromPair(first, second)
      if (candidate !== null) candidates.push(candidate)
    }
  }

  return candidates
}

function resultInstanceId(
  recipeId: string,
  materialInstanceIds: readonly string[],
  inventory: RunInventorySnapshot,
): string {
  const base = `fusion-${recipeId}-${[...materialInstanceIds].sort().join('-')}`
  const occupiedIds = new Set([
    ...inventory.bag.items.map((item) => item.instanceId),
    ...inventory.storage.items.map((item) => item.instanceId),
  ])
  if (!occupiedIds.has(base)) return base

  let suffix = 2
  while (occupiedIds.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

function candidatePositions(
  bag: RunBagState,
  first: RunBagItem,
  second: RunBagItem,
): GridPosition[] {
  const anchors = [first.position, second.position].sort(
    (left, right) => left.row - right.row || left.column - right.column,
  )
  const positions: GridPosition[] = []
  const seen = new Set<string>()

  const add = (position: GridPosition) => {
    const key = `${position.row}:${position.column}`
    if (seen.has(key)) return
    seen.add(key)
    positions.push({ ...position })
  }

  anchors.forEach(add)
  for (let row = 0; row < bag.rows; row += 1) {
    for (let column = 0; column < bag.columns; column += 1) add({ row, column })
  }
  return positions
}

function requireCandidateItems(
  inventory: RunInventorySnapshot,
  candidate: FusionCandidate,
): { first: RunBagItem; second: RunBagItem; recipe: Recipe } {
  if (candidate.firstInstanceId === candidate.secondInstanceId) {
    throw new Error('Fusion requires two distinct item instances')
  }

  const first = inventory.bag.items.find(
    (item) => item.instanceId === candidate.firstInstanceId,
  )
  const second = inventory.bag.items.find(
    (item) => item.instanceId === candidate.secondInstanceId,
  )
  if (first === undefined || second === undefined) {
    throw new Error('Fusion materials must both remain in the bag')
  }

  const recipe = matchFusionRecipe(first.itemId, second.itemId)
  if (recipe === null || recipe.id !== candidate.recipeId || recipe.result !== candidate.resultItemId) {
    throw new Error('Fusion candidate no longer matches its recipe')
  }
  if (!areItemsAdjacent(placementOf(first), placementOf(second))) {
    throw new Error('Fusion materials are no longer adjacent')
  }

  return { first, second, recipe }
}

export function fuseInventory(
  inventory: RunInventorySnapshot,
  candidate: FusionCandidate,
): FusionResult {
  const { first, second, recipe } = requireCandidateItems(inventory, candidate)
  const next = cloneInventory(inventory)
  next.bag.items = next.bag.items.filter(
    (item) => item.instanceId !== first.instanceId && item.instanceId !== second.instanceId,
  )

  // Fusion outputs begin as clean crafted instances. Affix inheritance is intentionally not implicit.
  const resultBase: RunInventoryItem = {
    instanceId: resultInstanceId(recipe.id, [first.instanceId, second.instanceId], next),
    itemId: recipe.result,
    affixIds: [],
    rotated: false,
    runDamageBonus: 0,
  }
  const position = candidatePositions(next.bag, first, second).find((candidatePosition) =>
    canPlaceBagItem(next.bag, resultBase, candidatePosition, false),
  )
  if (position === undefined) {
    throw new Error('融合結果を置く空きマスがありません。素材の周囲を空けてください。')
  }

  const resultItem: RunBagItem = { ...resultBase, position }
  next.bag.items.push(resultItem)
  return { inventory: next, recipe, resultItem }
}

export function getFusionCandidateKey(candidate: FusionCandidate): string {
  return `${candidate.recipeId}:${[candidate.firstInstanceId, candidate.secondInstanceId].sort().join(':')}`
}
