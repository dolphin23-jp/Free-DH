import { describe, expect, it } from 'vitest'

import {
  bagItemsToBuild,
  canPlaceBagItem,
  getBagItemCells,
  getBaseSellPrice,
  moveBagItem,
  moveBagItemToStorage,
  placeStorageItemInBag,
  removeInventoryItem,
  rotateBagItem,
} from '../src/store/bag'
import type {
  RunBagItem,
  RunInventoryItem,
  RunInventorySnapshot,
} from '../src/store/run'

function item(instanceId: string, itemId: string, rotated = false): RunInventoryItem {
  return {
    instanceId,
    itemId,
    affixIds: [],
    rotated,
    runDamageBonus: 0,
  }
}

function bagItem(
  instanceId: string,
  itemId: string,
  row: number,
  column: number,
  rotated = false,
): RunBagItem {
  return {
    ...item(instanceId, itemId, rotated),
    position: { row, column },
  }
}

function inventory(
  bagItems: RunBagItem[] = [],
  storageItems: RunInventoryItem[] = [],
  storageCapacity = 8,
): RunInventorySnapshot {
  return {
    bag: { columns: 4, rows: 3, items: bagItems },
    storage: { capacity: storageCapacity, items: storageItems },
  }
}

describe('bag geometry', () => {
  it('occupies all six cells of a 2x3 item', () => {
    expect(getBagItemCells(bagItem('greatsword', 'W06', 0, 0))).toEqual([
      { row: 0, column: 0 },
      { row: 0, column: 1 },
      { row: 1, column: 0 },
      { row: 1, column: 1 },
      { row: 2, column: 0 },
      { row: 2, column: 1 },
    ])
  })

  it('rotates a 2x3 item to 3x2 while preserving its anchor', () => {
    const next = rotateBagItem(inventory([bagItem('greatsword', 'W06', 0, 0)]), 'greatsword')

    expect(next.bag.items[0]?.rotated).toBe(true)
    expect(getBagItemCells(next.bag.items[0]!)).toEqual([
      { row: 0, column: 0 },
      { row: 0, column: 1 },
      { row: 0, column: 2 },
      { row: 1, column: 0 },
      { row: 1, column: 1 },
      { row: 1, column: 2 },
    ])
  })

  it('rejects rotation when the rotated shape would leave the bag', () => {
    const placed = inventory([bagItem('greatsword', 'W06', 0, 2)])
    expect(() => rotateBagItem(placed, 'greatsword')).toThrow()
  })

  it('rejects overlap without changing the original inventory', () => {
    const original = inventory([
      bagItem('greatsword', 'W06', 0, 0),
      bagItem('dagger', 'W01', 0, 2),
    ])

    expect(
      canPlaceBagItem(original.bag, original.bag.items[1]!, { row: 1, column: 1 }, false, 'dagger'),
    ).toBe(false)
    expect(() => moveBagItem(original, 'dagger', { row: 1, column: 1 })).toThrow()
    expect(original.bag.items[1]?.position).toEqual({ row: 0, column: 2 })
  })
})

describe('bag and storage transfers', () => {
  it('places a stored item into a valid bag cell', () => {
    const next = placeStorageItemInBag(
      inventory([], [item('spear', 'W12')]),
      'spear',
      { row: 0, column: 0 },
    )

    expect(next.storage.items).toHaveLength(0)
    expect(next.bag.items[0]).toMatchObject({
      instanceId: 'spear',
      position: { row: 0, column: 0 },
    })
  })

  it('moves a bag item to one of eight storage slots', () => {
    const next = moveBagItemToStorage(
      inventory([bagItem('dagger', 'W01', 0, 0)], [item('water', 'T07')]),
      'dagger',
      0,
    )

    expect(next.bag.items).toHaveLength(0)
    expect(next.storage.items.map((stored) => stored.instanceId)).toEqual(['dagger', 'water'])
    expect(next.storage.capacity).toBe(8)
  })

  it('rejects moving an item into full storage', () => {
    const stored = Array.from({ length: 8 }, (_, index) => item(`stored-${index}`, 'W01'))
    expect(() =>
      moveBagItemToStorage(inventory([bagItem('shield', 'A01', 0, 0)], stored), 'shield'),
    ).toThrow('Storage is full')
  })
})

describe('selling and combat build conversion', () => {
  it('removes an item and returns half of its rarity purchase price', () => {
    const original = inventory([bagItem('rare-spear', 'W12', 0, 0)])
    const removed = removeInventoryItem(original, 'rare-spear')

    expect(removed.inventory.bag.items).toHaveLength(0)
    expect(removed.item.itemId).toBe('W12')
    expect(getBaseSellPrice('W12')).toBe(7)
  })

  it('converts placed items directly into engine build input', () => {
    const build = bagItemsToBuild([
      {
        ...bagItem('hero-sword', 'E07', 1, 2, true),
        runDamageBonus: 1.4,
        resolvedModifiers: { flatDamage: 2 },
      },
    ])

    expect(build).toEqual([
      {
        instanceId: 'hero-sword',
        itemId: 'E07',
        position: { row: 1, column: 2 },
        rotated: true,
        runDamageBonus: 1.4,
        resolvedModifiers: { flatDamage: 2 },
      },
    ])
  })
})
