import { gameConfig, items, type Item, type Rarity } from '../data'
import { buildRarityDistribution, type RarityDistribution } from './drops'
import { fork, nextMulberry32, type Seed } from './rng'

const RARITY_ORDER: readonly Rarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
]

export interface ShopGenerationRequest {
  runSeed: Seed
  battleIndex: number
  rerollCount: number
  area: 1 | 2 | 3
  abyssLevel?: number
  unlockedItemIds?: readonly string[]
}

export interface ShopOffer {
  slot: number
  instanceId: string
  itemId: string
  rarity: Rarity
  price: number
}

export interface ShopListing {
  key: string
  streamSeed: number
  runSeed: Seed
  battleIndex: number
  rerollCount: number
  area: 1 | 2 | 3
  abyssLevel: number
  unlockedItemIds?: readonly string[]
  offers: readonly ShopOffer[]
}

interface RandomCursor {
  next: () => number
}

function requireNonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer`)
  }
  return value
}

function createRandomCursor(seed: number): RandomCursor {
  let state = seed
  return {
    next: () => {
      const step = nextMulberry32(state)
      state = step.state
      return step.value
    },
  }
}

function rollRarity(distribution: RarityDistribution, randomValue: number): Rarity {
  const roll = randomValue * 100
  let cumulative = 0

  for (const rarity of RARITY_ORDER) {
    cumulative += distribution[rarity]
    if (roll < cumulative) return rarity
  }

  return 'legendary'
}

function weightedPick<T>(
  candidates: readonly T[],
  weightOf: (candidate: T) => number,
  randomValue: number,
): T {
  if (candidates.length === 0) throw new Error('Cannot pick from an empty candidate list')
  const totalWeight = candidates.reduce((total, candidate) => total + weightOf(candidate), 0)
  if (!(totalWeight > 0)) throw new Error('Candidate weights must total more than zero')

  let cursor = randomValue * totalWeight
  for (const candidate of candidates) {
    cursor -= weightOf(candidate)
    if (cursor < 0) return candidate
  }
  return candidates[candidates.length - 1]!
}

function getEligibleItems(
  rarity: Rarity,
  unlockedItemIds: readonly string[] | undefined,
): Item[] {
  const unlocked =
    unlockedItemIds === undefined
      ? new Set(items.filter((item) => item.unlockCost === 0).map((item) => item.id))
      : new Set(unlockedItemIds)

  return items.filter(
    (item) => item.rarity === rarity && !item.fusionOnly && unlocked.has(item.id),
  )
}

export function getPurchasePrice(itemId: string): number {
  const item = items.find((candidate) => candidate.id === itemId)
  if (item === undefined) throw new Error(`Unknown item id: ${itemId}`)
  return gameConfig.shop.purchasePriceByRarity[item.rarity]
}

export function getRerollCost(rerollCount: number): number {
  const count = requireNonNegativeInteger(rerollCount, 'rerollCount')
  const costs = gameConfig.shop.rerollCosts
  return costs[Math.min(count, costs.length - 1)]!
}

export function getShopSellBonusRate(activeBagItemIds: readonly string[]): number {
  const itemById = new Map(items.map((item) => [item.id, item]))
  return activeBagItemIds.reduce((total, itemId) => {
    const item = itemById.get(itemId)
    if (item === undefined) return total
    return (
      total +
      (item.passives ?? [])
        .filter((passive) => passive.type === 'sellBonus')
        .reduce((sum, passive) => sum + passive.value, 0)
    )
  }, 0)
}

export function getShopSellPrice(
  itemId: string,
  activeBagItemIds: readonly string[],
): number {
  const item = items.find((candidate) => candidate.id === itemId)
  if (item === undefined) throw new Error(`Unknown item id: ${itemId}`)

  const basePrice =
    item.sellOverride ??
    gameConfig.shop.purchasePriceByRarity[item.rarity] * gameConfig.shop.sellPriceRate
  return Math.floor(basePrice * (1 + getShopSellBonusRate(activeBagItemIds)))
}

export function generateShopListing(request: ShopGenerationRequest): ShopListing {
  const battleIndex = requireNonNegativeInteger(request.battleIndex, 'battleIndex')
  const rerollCount = requireNonNegativeInteger(request.rerollCount, 'rerollCount')
  const abyssLevel = requireNonNegativeInteger(request.abyssLevel ?? 0, 'abyssLevel')
  const streamSeed = fork(request.runSeed, `shop:${battleIndex}:${rerollCount}`)
  const cursor = createRandomCursor(streamSeed)
  const distribution = buildRarityDistribution(request.area, abyssLevel, 0, 0)
  const offers: ShopOffer[] = []

  for (let slot = 0; slot < gameConfig.shop.slots; slot += 1) {
    const rarity = rollRarity(distribution, cursor.next())
    const candidates = getEligibleItems(rarity, request.unlockedItemIds)
    if (candidates.length === 0) {
      throw new Error(`No unlocked non-fusion item is available for rarity ${rarity}`)
    }
    const item = weightedPick(candidates, (candidate) => candidate.weight, cursor.next())
    offers.push({
      slot,
      instanceId: `shop-${streamSeed}-${slot}-${item.id}`,
      itemId: item.id,
      rarity,
      price: gameConfig.shop.purchasePriceByRarity[rarity],
    })
  }

  return {
    key: `${String(request.runSeed)}:${battleIndex}`,
    streamSeed,
    runSeed: request.runSeed,
    battleIndex,
    rerollCount,
    area: request.area,
    abyssLevel,
    ...(request.unlockedItemIds === undefined
      ? {}
      : { unlockedItemIds: [...request.unlockedItemIds] }),
    offers,
  }
}
