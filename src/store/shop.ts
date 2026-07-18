import { createStore, type StoreApi } from 'zustand/vanilla'

import { gameConfig } from '../data'
import {
  generateShopListing,
  getShopSellPrice,
  type ShopGenerationRequest,
  type ShopListing,
  type ShopOffer,
  type ShopSpecialOffer,
} from '../engine/shop'
import { cloneInventory, removeInventoryItem } from './bag'
import type { RunInventoryItem, RunInventorySnapshot } from './run'

export interface ShopSessionData {
  listing: ShopListing | null
  purchasedSlots: number[]
  healUsed: boolean
  cursedChestPurchased: boolean
  gamblerPurchased: boolean
}

export interface ShopSessionActions {
  prepareShop: (request: Omit<ShopGenerationRequest, 'rerollCount'>) => ShopListing
  reroll: () => ShopListing
  markPurchased: (slot: number) => void
  markHealUsed: () => void
  markSpecialPurchased: (kind: ShopSpecialOffer['kind']) => void
  resetShop: () => void
}

export type ShopSessionState = ShopSessionData & ShopSessionActions

export interface ShopPurchaseResult {
  inventory: RunInventorySnapshot
  gold: number
  item: RunInventoryItem
}

export interface ShopSaleResult {
  inventory: RunInventorySnapshot
  gold: number
  price: number
  item: RunInventoryItem
}

export interface ShopHealResult {
  currentHp: number
  gold: number
}

function requireFiniteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite non-negative number`)
  }
  return value
}

export function shopOfferToInventoryItem(offer: ShopOffer): RunInventoryItem {
  return {
    instanceId: offer.instanceId,
    itemId: offer.itemId,
    affixIds: [],
    rotated: false,
    runDamageBonus: 0,
  }
}

export function shopSpecialToInventoryItem(offer: ShopSpecialOffer): RunInventoryItem {
  const item: RunInventoryItem = {
    instanceId: offer.reward.instanceId,
    itemId: offer.reward.itemId,
    affixIds: [],
    rotated: false,
    runDamageBonus: 0,
  }
  if (offer.kind === 'cursedChest') {
    item.resolvedTriggers = [
      {
        trigger: 'battleStart',
        type: 'maxHp',
        value: -gameConfig.shop.cursedChest.maxHpPenalty,
      },
    ]
  }
  return item
}

export function purchaseShopOffer(
  inventory: RunInventorySnapshot,
  gold: number,
  offer: ShopOffer,
): ShopPurchaseResult {
  const currentGold = requireFiniteNonNegative(gold, 'gold')
  if (currentGold < offer.price) throw new Error('Not enough gold')
  if (inventory.storage.items.length >= inventory.storage.capacity) {
    throw new Error('Storage is full')
  }

  const next = cloneInventory(inventory)
  const item = shopOfferToInventoryItem(offer)
  next.storage.items.push(item)
  return { inventory: next, gold: currentGold - offer.price, item }
}

export function purchaseShopSpecialOffer(
  inventory: RunInventorySnapshot,
  gold: number,
  offer: ShopSpecialOffer,
): ShopPurchaseResult {
  const currentGold = requireFiniteNonNegative(gold, 'gold')
  if (currentGold < offer.cost) throw new Error('Not enough gold')
  if (inventory.storage.items.length >= inventory.storage.capacity) {
    throw new Error('Storage is full')
  }

  const next = cloneInventory(inventory)
  const item = shopSpecialToInventoryItem(offer)
  next.storage.items.push(item)
  return { inventory: next, gold: currentGold - offer.cost, item }
}

export function sellInventoryItemToShop(
  inventory: RunInventorySnapshot,
  gold: number,
  instanceId: string,
): ShopSaleResult {
  const currentGold = requireFiniteNonNegative(gold, 'gold')
  const activeBagItemIds = inventory.bag.items.map((item) => item.itemId)
  const removed = removeInventoryItem(inventory, instanceId)
  const price = getShopSellPrice(removed.item.itemId, activeBagItemIds)
  return {
    inventory: removed.inventory,
    gold: currentGold + price,
    price,
    item: removed.item,
  }
}

export function applyShopHeal(
  currentHp: number,
  maxHp: number,
  gold: number,
  alreadyUsed: boolean,
): ShopHealResult {
  const hp = requireFiniteNonNegative(currentHp, 'currentHp')
  const maximum = requireFiniteNonNegative(maxHp, 'maxHp')
  const currentGold = requireFiniteNonNegative(gold, 'gold')
  if (hp > maximum) throw new RangeError('currentHp must not exceed maxHp')
  if (alreadyUsed) throw new Error('Heal service has already been used in this shop')
  if (hp >= maximum) throw new Error('HP is already full')
  if (currentGold < gameConfig.shop.healService.cost) throw new Error('Not enough gold')

  return {
    currentHp: Math.min(maximum, hp + gameConfig.shop.healService.hp),
    gold: currentGold - gameConfig.shop.healService.cost,
  }
}

function createInitialData(): ShopSessionData {
  return {
    listing: null,
    purchasedSlots: [],
    healUsed: false,
    cursedChestPurchased: false,
    gamblerPurchased: false,
  }
}

export function createShopStore(): StoreApi<ShopSessionState> {
  return createStore<ShopSessionState>()((set, get) => ({
    ...createInitialData(),

    prepareShop: (request) => {
      const current = get()
      const key = `${String(request.runSeed)}:${request.battleIndex}`
      if (current.listing?.key === key) return current.listing

      const listing = generateShopListing({ ...request, rerollCount: 0 })
      set({
        listing,
        purchasedSlots: [],
        healUsed: false,
        cursedChestPurchased: false,
        gamblerPurchased: false,
      })
      return listing
    },

    reroll: () => {
      const current = get()
      if (current.listing === null) throw new Error('No shop is prepared')
      const listing = generateShopListing({
        runSeed: current.listing.runSeed,
        battleIndex: current.listing.battleIndex,
        rerollCount: current.listing.rerollCount + 1,
        area: current.listing.area,
        abyssLevel: current.listing.abyssLevel,
        ...(current.listing.unlockedItemIds === undefined
          ? {}
          : { unlockedItemIds: current.listing.unlockedItemIds }),
      })
      set({ listing, purchasedSlots: [] })
      return listing
    },

    markPurchased: (slot) => {
      const current = get()
      if (current.listing === null || !current.listing.offers.some((offer) => offer.slot === slot)) {
        throw new Error(`Unknown shop slot: ${slot}`)
      }
      if (current.purchasedSlots.includes(slot)) return
      set({ purchasedSlots: [...current.purchasedSlots, slot] })
    },

    markHealUsed: () => set({ healUsed: true }),
    markSpecialPurchased: (kind) =>
      set(kind === 'cursedChest' ? { cursedChestPurchased: true } : { gamblerPurchased: true }),
    resetShop: () => set(createInitialData()),
  }))
}

export const shopStore = createShopStore()
