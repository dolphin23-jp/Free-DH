import { describe, expect, it } from 'vitest'

import { gameConfig, items } from '../src/data'
import {
  generateShopListing,
  type ShopListing,
  type ShopSpecialOffer,
} from '../src/engine/shop'
import { createCodexStore } from '../src/store/codex'
import { createDropProgressStore } from '../src/store/drop-progress'
import { createMetaStore } from '../src/store/meta'
import { exportGameSave, loadGameSave } from '../src/store/save'
import {
  createShopStore,
  purchaseShopSpecialOffer,
} from '../src/store/shop'
import { createRunStore, type RunInventorySnapshot } from '../src/store/run'

const baseRequest = {
  battleIndex: 3,
  rerollCount: 0,
  area: 1 as const,
  abyssLevel: 0,
}

function emptyInventory(): RunInventorySnapshot {
  return {
    bag: { columns: 4, rows: 3, items: [] },
    storage: { capacity: 8, items: [] },
  }
}

function findSpecial(kind: ShopSpecialOffer['kind']): {
  listing: ShopListing
  offer: ShopSpecialOffer
} {
  for (let seed = 0; seed < 5000; seed += 1) {
    const listing = generateShopListing({ ...baseRequest, runSeed: `special-${seed}` })
    const offer =
      kind === 'cursedChest'
        ? listing.specials.cursedChest
        : listing.specials.gambler
    if (offer !== null) return { listing, offer }
  }
  throw new Error(`Could not find deterministic ${kind} fixture`)
}

describe('deterministic special shop events', () => {
  it('keeps event appearance and rewards stable across duplicate generation and rerolls', () => {
    const first = generateShopListing({ ...baseRequest, runSeed: 'event-stability' })
    const duplicate = generateShopListing({ ...baseRequest, runSeed: 'event-stability' })
    const rerolled = generateShopListing({
      ...baseRequest,
      runSeed: 'event-stability',
      rerollCount: 1,
    })

    expect(duplicate).toEqual(first)
    expect(rerolled.streamSeed).not.toBe(first.streamSeed)
    expect(rerolled.specials).toEqual(first.specials)
  })

  it('creates a configured epic-or-better cursed reward with a max-HP penalty', () => {
    const { offer } = findSpecial('cursedChest')
    const result = purchaseShopSpecialOffer(emptyInventory(), 100, offer)
    const reward = result.inventory.storage.items[0]!

    expect(offer.cost).toBe(gameConfig.shop.cursedChest.cost)
    expect(['epic', 'legendary']).toContain(offer.reward.rarity)
    expect(result.gold).toBe(100 - gameConfig.shop.cursedChest.cost)
    expect(reward.itemId).toBe(offer.reward.itemId)
    expect(reward.resolvedTriggers).toEqual([
      {
        trigger: 'battleStart',
        type: 'maxHp',
        value: -gameConfig.shop.cursedChest.maxHpPenalty,
      },
    ])
  })

  it('creates a configured equal-rarity gambler reward without the curse penalty', () => {
    const { offer } = findSpecial('gambler')
    const result = purchaseShopSpecialOffer(emptyInventory(), 100, offer)
    const definition = items.find((item) => item.id === offer.reward.itemId)

    expect(offer.cost).toBe(gameConfig.shop.gambler.cost)
    expect(result.gold).toBe(100 - gameConfig.shop.gambler.cost)
    expect(definition).toBeDefined()
    expect(definition?.fusionOnly).toBe(false)
    expect(definition?.unlockCost).toBe(0)
    expect(result.inventory.storage.items[0]?.resolvedTriggers).toBeUndefined()
  })

  it('preserves one-use event state through rerolls and resets it for the next shop', () => {
    const { listing, offer } = findSpecial('cursedChest')
    const store = createShopStore()
    store.getState().prepareShop({
      runSeed: listing.runSeed,
      battleIndex: listing.battleIndex,
      area: listing.area,
      abyssLevel: listing.abyssLevel,
    })
    store.getState().markSpecialPurchased(offer.kind)
    store.getState().reroll()

    expect(store.getState().cursedChestPurchased).toBe(true)
    store.getState().prepareShop({
      runSeed: listing.runSeed,
      battleIndex: listing.battleIndex + 1,
      area: listing.area,
      abyssLevel: listing.abyssLevel,
    })
    expect(store.getState().cursedChestPurchased).toBe(false)
    expect(store.getState().gamblerPurchased).toBe(false)
  })

  it('rebuilds T20-era open-shop saves that lack T22 fields', () => {
    const run = createRunStore()
    const codex = createCodexStore()
    const meta = createMetaStore()
    const drops = createDropProgressStore()
    const shop = createShopStore()
    run.getState().startRun('legacy-open-shop')
    shop.getState().prepareShop({
      runSeed: 'legacy-open-shop',
      battleIndex: 0,
      area: 1,
      abyssLevel: 0,
      unlockedItemIds: meta.getState().unlockedItemIds,
    })

    const legacy = exportGameSave(
      run.getState(),
      codex.getState(),
      meta.getState(),
      drops.getState(),
      shop.getState(),
    ) as unknown as {
      shop: Record<string, unknown> & { listing: Record<string, unknown> | null }
    }
    delete legacy.shop.cursedChestPurchased
    delete legacy.shop.gamblerPurchased
    if (legacy.shop.listing !== null) delete legacy.shop.listing.specials

    const restoredRun = createRunStore()
    const restoredCodex = createCodexStore()
    const restoredMeta = createMetaStore()
    const restoredDrops = createDropProgressStore()
    const restoredShop = createShopStore()
    loadGameSave(
      legacy,
      restoredRun,
      restoredCodex,
      restoredMeta,
      restoredDrops,
      restoredShop,
    )

    expect(restoredShop.getState().listing?.specials).toBeDefined()
    expect(restoredShop.getState().cursedChestPurchased).toBe(false)
    expect(restoredShop.getState().gamblerPurchased).toBe(false)
  })
})
