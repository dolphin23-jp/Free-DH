import { describe, expect, it } from 'vitest'

import { gameConfig, items } from '../src/data'
import {
  generateShopListing,
  getPurchasePrice,
  getRerollCost,
  getShopSellPrice,
} from '../src/engine/shop'
import {
  applyShopHeal,
  createShopStore,
  purchaseShopOffer,
  sellInventoryItemToShop,
} from '../src/store/shop'
import type { RunInventoryItem, RunInventorySnapshot } from '../src/store/run'

const request = {
  runSeed: 'shop-test',
  battleIndex: 4,
  area: 1 as const,
  abyssLevel: 0,
}

function item(instanceId: string, itemId: string): RunInventoryItem {
  return {
    instanceId,
    itemId,
    affixIds: [],
    rotated: false,
    runDamageBonus: 0,
  }
}

function inventory(
  bagItems: RunInventorySnapshot['bag']['items'] = [],
  storageItems: RunInventoryItem[] = [],
  capacity = 8,
): RunInventorySnapshot {
  return {
    bag: { columns: 4, rows: 3, items: bagItems },
    storage: { capacity, items: storageItems },
  }
}

describe('deterministic shop listing', () => {
  it('uses six deterministic offers and an independent stream per reroll', () => {
    const first = generateShopListing({ ...request, rerollCount: 0 })
    const duplicate = generateShopListing({ ...request, rerollCount: 0 })
    const rerolled = generateShopListing({ ...request, rerollCount: 1 })

    expect(duplicate).toEqual(first)
    expect(first.offers).toHaveLength(gameConfig.shop.slots)
    expect(rerolled.streamSeed).not.toBe(first.streamSeed)
    expect(first.offers.map((offer) => offer.slot)).toEqual([0, 1, 2, 3, 4, 5])

    for (const offer of first.offers) {
      const definition = items.find((candidate) => candidate.id === offer.itemId)
      expect(definition).toBeDefined()
      expect(definition?.fusionOnly).toBe(false)
      expect(definition?.unlockCost).toBe(0)
      expect(offer.price).toBe(getPurchasePrice(offer.itemId))
    }
  })

  it('uses the configured reroll price sequence and keeps the final price thereafter', () => {
    expect(Array.from({ length: 8 }, (_, index) => getRerollCost(index))).toEqual([
      5, 7, 10, 14, 19, 19, 19, 19,
    ])
  })
})

describe('shop session state', () => {
  it('resets purchases, healing, and reroll count for each battle-index shop', () => {
    const store = createShopStore()
    const first = store.getState().prepareShop(request)
    store.getState().markPurchased(first.offers[0]!.slot)
    store.getState().markHealUsed()
    const rerolled = store.getState().reroll()

    expect(rerolled.rerollCount).toBe(1)
    expect(store.getState().purchasedSlots).toEqual([])
    expect(store.getState().healUsed).toBe(true)
    expect(store.getState().prepareShop(request)).toEqual(rerolled)

    const nextShop = store.getState().prepareShop({ ...request, battleIndex: 5 })
    expect(nextShop.rerollCount).toBe(0)
    expect(store.getState().purchasedSlots).toEqual([])
    expect(store.getState().healUsed).toBe(false)
  })
})

describe('shop transactions', () => {
  it('purchases an offer into storage and deducts its configured price', () => {
    const offer = generateShopListing({ ...request, rerollCount: 0 }).offers[0]!
    const result = purchaseShopOffer(inventory(), 100, offer)

    expect(result.gold).toBe(100 - offer.price)
    expect(result.inventory.storage.items).toEqual([
      {
        instanceId: offer.instanceId,
        itemId: offer.itemId,
        affixIds: [],
        rotated: false,
        runDamageBonus: 0,
      },
    ])
  })

  it('rejects purchases when storage is full', () => {
    const offer = generateShopListing({ ...request, rerollCount: 0 }).offers[0]!
    expect(() => purchaseShopOffer(inventory([], [item('full', 'W01')], 1), 100, offer)).toThrow(
      'Storage is full',
    )
  })

  it('applies sellOverride and the active Merchant Scale bonus', () => {
    expect(getShopSellPrice('E02', [])).toBe(15)
    expect(getShopSellPrice('W12', ['E03'])).toBe(9)

    const result = sellInventoryItemToShop(
      inventory(
        [
          {
            ...item('scale', 'E03'),
            position: { row: 0, column: 0 },
          },
        ],
        [item('spear', 'W12')],
      ),
      10,
      'spear',
    )
    expect(result.price).toBe(9)
    expect(result.gold).toBe(19)
    expect(result.inventory.storage.items).toHaveLength(0)
  })

  it('heals once, clamps to max HP, and deducts the configured cost', () => {
    expect(applyShopHeal(88, 100, 30, false)).toEqual({
      currentHp: 100,
      gold: 10,
    })
    expect(() => applyShopHeal(50, 100, 100, true)).toThrow(
      'Heal service has already been used in this shop',
    )
  })
})
