import { affixPool, gameConfig, items, type Affix, type Item, type Rarity } from '../data'
import { fork, nextMulberry32, type Seed } from './rng'

const RARITY_ORDER: readonly Rarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
]

export interface RarityDistribution {
  common: number
  uncommon: number
  rare: number
  epic: number
  legendary: number
}

export interface DropGenerationRequest {
  runSeed: Seed
  battleIndex: number
  area: 1 | 2 | 3
  isBoss: boolean
  abyssLevel?: number
  dropLuckPercent?: number
  legendaryMissBattles: number
  elite?: boolean
  additionalSlots?: number
  unlockedItemIds?: readonly string[]
}

export interface DroppedItem {
  instanceId: string
  itemId: string
  rarity: Rarity
  affixIds: readonly string[]
}

export interface DropBatch {
  key: string
  streamSeed: number
  battleIndex: number
  area: 1 | 2 | 3
  pityBefore: number
  pityAfter: number
  drops: readonly DroppedItem[]
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

function requireNonNegativeFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite non-negative number`)
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

function transferFromCommon(
  distribution: RarityDistribution,
  rarity: Exclude<Rarity, 'common'>,
  requestedPercent: number,
): void {
  const transfer = Math.min(distribution.common, Math.max(0, requestedPercent))
  distribution.common -= transfer
  distribution[rarity] += transfer
}

export function getLegendaryPityBonusPercent(legendaryMissBattles: number): number {
  const misses = requireNonNegativeInteger(legendaryMissBattles, 'legendaryMissBattles')
  const config = gameConfig.drops.legendaryPity
  if (misses < config.startsAfterBattles) return 0
  return (misses - config.startsAfterBattles + 1) * config.increasePercentPerBattle
}

export function buildRarityDistribution(
  area: 1 | 2 | 3,
  abyssLevel = 0,
  dropLuckPercent = 0,
  legendaryMissBattles = 0,
): RarityDistribution {
  const level = requireNonNegativeInteger(abyssLevel, 'abyssLevel')
  if (level > gameConfig.abyss.maximumLevel) {
    throw new RangeError(`abyssLevel must be at most ${gameConfig.abyss.maximumLevel}`)
  }
  const luck = requireNonNegativeFinite(dropLuckPercent, 'dropLuckPercent')
  const base = gameConfig.drops.rarityPercentByArea[String(area) as '1' | '2' | '3']
  const distribution: RarityDistribution = { ...base }

  transferFromCommon(
    distribution,
    'rare',
    gameConfig.drops.abyssShiftPercentPerLevel.rare * level,
  )
  transferFromCommon(
    distribution,
    'epic',
    gameConfig.drops.abyssShiftPercentPerLevel.epic * level,
  )
  transferFromCommon(
    distribution,
    'legendary',
    gameConfig.drops.abyssShiftPercentPerLevel.legendary * level,
  )
  transferFromCommon(
    distribution,
    'legendary',
    luck + getLegendaryPityBonusPercent(legendaryMissBattles),
  )

  return distribution
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

function affixMatchesItem(affix: Affix, item: Item): boolean {
  if (affix.target === 'any') return true
  if (affix.target === 'weapon') return item.tags.includes('weapon')
  if (affix.target === 'shield') return item.tags.includes('shield')
  return item.cooldown !== undefined
}

function getAffixCount(rarity: Rarity, cursor: RandomCursor): number {
  const config = gameConfig.drops.affixesPerRarity[rarity]
  if (config.maximum === config.minimum) return config.minimum
  return cursor.next() * 100 < config.secondAffixChancePercent
    ? config.maximum
    : config.minimum
}

function rollAffixIds(item: Item, cursor: RandomCursor): string[] {
  const desiredCount = getAffixCount(item.rarity, cursor)
  const available = affixPool.filter((affix) => affixMatchesItem(affix, item))
  const selected: string[] = []

  while (selected.length < desiredCount && available.length > 0) {
    const selectedIndex = Math.floor(cursor.next() * available.length)
    const [affix] = available.splice(selectedIndex, 1)
    if (affix !== undefined) selected.push(affix.id)
  }

  return selected
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

function getSlotCount(request: DropGenerationRequest): number {
  const base = request.isBoss ? gameConfig.drops.bossSlots : gameConfig.drops.normalSlots
  const eliteBonus = request.elite ? gameConfig.drops.eliteBonusSlots : 0
  return base + eliteBonus + requireNonNegativeInteger(request.additionalSlots ?? 0, 'additionalSlots')
}

export function getDropLuckPercent(itemIds: readonly string[]): number {
  const definitions = new Map(items.map((item) => [item.id, item]))
  return itemIds.reduce((total, itemId) => {
    const item = definitions.get(itemId)
    if (item === undefined) return total
    return (
      total +
      (item.passives ?? [])
        .filter((passive) => passive.type === 'dropLuck')
        .reduce((sum, passive) => sum + passive.value, 0)
    )
  }, 0)
}

export function getPityAfterDrops(
  legendaryMissBattles: number,
  drops: readonly Pick<DroppedItem, 'rarity'>[],
): number {
  const misses = requireNonNegativeInteger(legendaryMissBattles, 'legendaryMissBattles')
  return drops.some((drop) => drop.rarity === 'legendary') ? 0 : misses + 1
}

export function generateDropBatch(request: DropGenerationRequest): DropBatch {
  const battleIndex = requireNonNegativeInteger(request.battleIndex, 'battleIndex')
  const pityBefore = requireNonNegativeInteger(
    request.legendaryMissBattles,
    'legendaryMissBattles',
  )
  const streamSeed = fork(request.runSeed, `drops:${battleIndex}`)
  const cursor = createRandomCursor(streamSeed)
  const distribution = buildRarityDistribution(
    request.area,
    request.abyssLevel ?? 0,
    request.dropLuckPercent ?? 0,
    pityBefore,
  )
  const drops: DroppedItem[] = []

  for (let slot = 0; slot < getSlotCount(request); slot += 1) {
    const rarity = rollRarity(distribution, cursor.next())
    const candidates = getEligibleItems(rarity, request.unlockedItemIds)
    if (candidates.length === 0) {
      throw new Error(`No unlocked non-fusion item is available for rarity ${rarity}`)
    }
    const item = weightedPick(candidates, (candidate) => candidate.weight, cursor.next())
    drops.push({
      instanceId: `drop-${streamSeed}-${slot}-${item.id}`,
      itemId: item.id,
      rarity,
      affixIds: rollAffixIds(item, cursor),
    })
  }

  return {
    key: `${String(request.runSeed)}:${battleIndex}`,
    streamSeed,
    battleIndex,
    area: request.area,
    pityBefore,
    pityAfter: getPityAfterDrops(pityBefore, drops),
    drops,
  }
}
