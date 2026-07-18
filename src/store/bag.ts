import { gameConfig, items } from '../data'
import type { BuildItemInput } from '../engine/combat'
import { getOccupiedCells, type GridPosition } from '../engine/adjacency'
import type {
  RunBagItem,
  RunBagState,
  RunInventoryItem,
  RunInventorySnapshot,
} from './run'

const itemById = new Map(items.map((item) => [item.id, item]))

function cloneInventoryItem(item: RunInventoryItem): RunInventoryItem {
  return {
    ...item,
    affixIds: [...item.affixIds],
    ...(item.resolvedModifiers === undefined
      ? {}
      : { resolvedModifiers: { ...item.resolvedModifiers } }),
    ...(item.resolvedTriggers === undefined
      ? {}
      : { resolvedTriggers: item.resolvedTriggers.map((trigger) => ({ ...trigger })) }),
  }
}

function cloneBagItem(item: RunBagItem): RunBagItem {
  return {
    ...cloneInventoryItem(item),
    position: { ...item.position },
  }
}

export function cloneInventory(inventory: RunInventorySnapshot): RunInventorySnapshot {
  return {
    bag: {
      columns: inventory.bag.columns,
      rows: inventory.bag.rows,
      items: inventory.bag.items.map(cloneBagItem),
    },
    storage: {
      capacity: inventory.storage.capacity,
      items: inventory.storage.items.map(cloneInventoryItem),
    },
  }
}

export function getItemDefinition(itemId: string) {
  const item = itemById.get(itemId)
  if (item === undefined) {
    throw new Error(`Unknown item id: ${itemId}`)
  }
  return item
}

function cellKey(cell: GridPosition): string {
  return `${cell.row}:${cell.column}`
}

export function getBagItemCells(item: RunBagItem): GridPosition[] {
  return getOccupiedCells({
    position: item.position,
    size: getItemDefinition(item.itemId).size,
    rotated: item.rotated,
  })
}

export function canPlaceBagItem(
  bag: RunBagState,
  item: RunInventoryItem,
  position: GridPosition,
  rotated = item.rotated,
  ignoredInstanceId?: string,
): boolean {
  const candidateCells = getOccupiedCells({
    position,
    size: getItemDefinition(item.itemId).size,
    rotated,
  })

  if (
    candidateCells.some(
      (cell) =>
        cell.row < 0 ||
        cell.column < 0 ||
        cell.row >= bag.rows ||
        cell.column >= bag.columns,
    )
  ) {
    return false
  }

  const occupied = new Set(
    bag.items
      .filter((placed) => placed.instanceId !== ignoredInstanceId)
      .flatMap(getBagItemCells)
      .map(cellKey),
  )

  return candidateCells.every((cell) => !occupied.has(cellKey(cell)))
}

function requireStorageItem(inventory: RunInventorySnapshot, instanceId: string): RunInventoryItem {
  const item = inventory.storage.items.find((candidate) => candidate.instanceId === instanceId)
  if (item === undefined) {
    throw new Error(`Storage item not found: ${instanceId}`)
  }
  return item
}

function requireBagItem(inventory: RunInventorySnapshot, instanceId: string): RunBagItem {
  const item = inventory.bag.items.find((candidate) => candidate.instanceId === instanceId)
  if (item === undefined) {
    throw new Error(`Bag item not found: ${instanceId}`)
  }
  return item
}

export function placeStorageItemInBag(
  inventory: RunInventorySnapshot,
  instanceId: string,
  position: GridPosition,
): RunInventorySnapshot {
  const item = requireStorageItem(inventory, instanceId)
  if (!canPlaceBagItem(inventory.bag, item, position)) {
    throw new Error(`Item ${instanceId} cannot be placed at ${position.row}:${position.column}`)
  }

  const next = cloneInventory(inventory)
  next.storage.items = next.storage.items.filter((candidate) => candidate.instanceId !== instanceId)
  next.bag.items.push({
    ...cloneInventoryItem(item),
    position: { ...position },
  })
  return next
}

export function moveBagItem(
  inventory: RunInventorySnapshot,
  instanceId: string,
  position: GridPosition,
): RunInventorySnapshot {
  const item = requireBagItem(inventory, instanceId)
  if (!canPlaceBagItem(inventory.bag, item, position, item.rotated, instanceId)) {
    throw new Error(`Item ${instanceId} cannot be moved to ${position.row}:${position.column}`)
  }

  const next = cloneInventory(inventory)
  const target = next.bag.items.find((candidate) => candidate.instanceId === instanceId)!
  target.position = { ...position }
  return next
}

export function rotateBagItem(
  inventory: RunInventorySnapshot,
  instanceId: string,
): RunInventorySnapshot {
  const item = requireBagItem(inventory, instanceId)
  const rotated = !item.rotated
  if (!canPlaceBagItem(inventory.bag, item, item.position, rotated, instanceId)) {
    throw new Error(`Item ${instanceId} cannot be rotated at its current position`)
  }

  const next = cloneInventory(inventory)
  const target = next.bag.items.find((candidate) => candidate.instanceId === instanceId)!
  target.rotated = rotated
  return next
}

function insertAt<T>(items: T[], item: T, targetIndex?: number): void {
  const index = Math.max(0, Math.min(targetIndex ?? items.length, items.length))
  items.splice(index, 0, item)
}

export function moveBagItemToStorage(
  inventory: RunInventorySnapshot,
  instanceId: string,
  targetIndex?: number,
): RunInventorySnapshot {
  if (inventory.storage.items.length >= inventory.storage.capacity) {
    throw new Error('Storage is full')
  }

  const item = requireBagItem(inventory, instanceId)
  const next = cloneInventory(inventory)
  next.bag.items = next.bag.items.filter((candidate) => candidate.instanceId !== instanceId)
  insertAt(next.storage.items, cloneInventoryItem(item), targetIndex)
  return next
}

export function reorderStorageItem(
  inventory: RunInventorySnapshot,
  instanceId: string,
  targetIndex: number,
): RunInventorySnapshot {
  const item = requireStorageItem(inventory, instanceId)
  const next = cloneInventory(inventory)
  next.storage.items = next.storage.items.filter((candidate) => candidate.instanceId !== instanceId)
  insertAt(next.storage.items, cloneInventoryItem(item), targetIndex)
  return next
}

export function removeInventoryItem(
  inventory: RunInventorySnapshot,
  instanceId: string,
): { inventory: RunInventorySnapshot; item: RunInventoryItem } {
  const bagItem = inventory.bag.items.find((candidate) => candidate.instanceId === instanceId)
  const storageItem = inventory.storage.items.find(
    (candidate) => candidate.instanceId === instanceId,
  )
  const item = bagItem ?? storageItem
  if (item === undefined) {
    throw new Error(`Inventory item not found: ${instanceId}`)
  }

  const next = cloneInventory(inventory)
  next.bag.items = next.bag.items.filter((candidate) => candidate.instanceId !== instanceId)
  next.storage.items = next.storage.items.filter(
    (candidate) => candidate.instanceId !== instanceId,
  )
  return { inventory: next, item: cloneInventoryItem(item) }
}

export function getBaseSellPrice(itemId: string): number {
  const item = getItemDefinition(itemId)
  const purchasePrice = gameConfig.shop.purchasePriceByRarity[item.rarity]
  return Math.floor(purchasePrice * gameConfig.shop.sellPriceRate)
}

export function bagItemsToBuild(itemsInBag: readonly RunBagItem[]): BuildItemInput[] {
  return itemsInBag.map((item) => ({
    instanceId: item.instanceId,
    itemId: item.itemId,
    position: { ...item.position },
    rotated: item.rotated,
    runDamageBonus: item.runDamageBonus,
    ...(item.resolvedModifiers === undefined
      ? {}
      : { resolvedModifiers: { ...item.resolvedModifiers } }),
    ...(item.resolvedTriggers === undefined
      ? {}
      : { resolvedTriggers: item.resolvedTriggers.map((trigger) => ({ ...trigger })) }),
  }))
}
