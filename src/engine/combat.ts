import { enemies, gameConfig, items } from '../data'
import type {
  ActiveEffect,
  Adjacency,
  EnemyAbility,
  EnemyEffect,
  EnemyTag,
  Item,
  Passive,
  Rarity,
  TriggerEffect,
} from '../data/schema'
import { areItemsAdjacent, getOccupiedCells, type GridPosition } from './adjacency'
import { nextMulberry32, normalizeSeed, type Seed } from './rng'
import {
  advanceStatusDurations,
  applyStatus,
  cleansePoisonAndBurn,
  cloneStatusState,
  createStatusState,
  getBurnStacks,
  isSlowed,
  SLOW_COOLDOWN_PROGRESS_MULTIPLIER,
  type StatusKind,
  type StatusSetup,
  type StatusState,
} from './status'

export const TICK_SECONDS = 0.1
const EPSILON = 1e-9
const PRECISION_DIGITS = 10
const DAMAGE_PRECISION_FACTOR = 10
const TICKS_PER_SECOND = 10
const DEFAULT_HP_BELOW_PERCENT = 50
const GUARDIAN_HEAL_THRESHOLD_PERCENT = 30

const RARITY_RANK: Readonly<Record<Rarity, number>> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
}

export type CombatResult = 'ongoing' | 'playerVictory' | 'playerDefeat'
export type CombatSide = 'player' | 'enemy'
export type CombatTriggerName = TriggerEffect['trigger']
export type CombatTriggerEffectType = TriggerEffect['type'] | 'maxHp' | 'healPercent'

export type { GridPosition } from './adjacency'

export interface ResolvedItemModifiersInput {
  flatDamage?: number
  damageMultiplier?: number
  critChancePercent?: number
  critMultiplier?: number
  specialMultiplier?: number
  cooldownMultiplier?: number
  staminaMultiplier?: number
  blockFlat?: number
  effectMultiplier?: number
}

export interface CombatTriggerEffect {
  trigger: CombatTriggerName
  type: CombatTriggerEffectType
  value: number
  status?: StatusKind
  thresholdPercent?: number
}

export interface BuildItemInput {
  instanceId: string
  itemId: string
  position: GridPosition
  rotated?: boolean
  sealed?: boolean
  initialCooldown?: number
  resolvedModifiers?: ResolvedItemModifiersInput
  resolvedTriggers?: readonly CombatTriggerEffect[]
  runDamageBonus?: number
}

export interface PlayerSetupOverrides {
  maxHp?: number
  hp?: number
  block?: number
  blockCap?: number
  stamina?: number
  staminaCap?: number
  staminaRegenPerSecond?: number
  statuses?: StatusSetup
}

export interface EnemySetupOverrides {
  maxHp?: number
  hp?: number
  block?: number
  blockCap?: number
  initialCooldowns?: readonly number[]
  statuses?: StatusSetup
  triggers?: readonly CombatTriggerEffect[]
}

export interface CombatSetup {
  build: readonly BuildItemInput[]
  enemyId: string
  seed: Seed
  player?: PlayerSetupOverrides
  enemy?: EnemySetupOverrides
}

export interface ResolvedItemModifiers {
  flatDamage: number
  damageMultiplier: number
  critChancePercent: number
  critMultiplier: number | null
  specialMultiplier: number
  cooldownMultiplier: number
  staminaMultiplier: number
  blockFlat: number
  effectMultiplier: number
}

export interface PlayerItemState {
  instanceId: string
  itemId: string
  position: GridPosition
  size: readonly [number, number]
  rotated: boolean
  sealed: boolean
  cooldown: number
  baseCooldown: number | null
  staminaCost: number
  baseStaminaCost: number
  battleDamageBonus: number
  runDamageBonus: number
  virtual: boolean
  duplicateOfInstanceId?: string
  duplicatedByInstanceId?: string
  usesDefaultInitialCooldown: boolean
  effects: readonly ActiveEffect[]
  passives: readonly Passive[]
  triggers: readonly CombatTriggerEffect[]
  modifiers: ResolvedItemModifiers
}

export interface EnemyAbilityState {
  index: number
  name: string
  cooldown: number
  baseCooldown: number
  effects: readonly EnemyEffect[]
}

export interface PlayerCombatState {
  hp: number
  maxHp: number
  block: number
  blockCap: number
  stamina: number
  staminaCap: number
  staminaRegenPerSecond: number
  statuses: StatusState
  items: PlayerItemState[]
}

export interface EnemyCombatState {
  id: string
  hp: number
  maxHp: number
  block: number
  blockCap: number
  phaseIndex: number
  tags: readonly EnemyTag[]
  statuses: StatusState
  abilities: EnemyAbilityState[]
  triggers: readonly CombatTriggerEffect[]
}

export interface CombatState {
  tick: number
  time: number
  result: CombatResult
  rngState: number
  battleStarted: boolean
  terminalTriggersResolved: boolean
  consumedTriggerKeys: string[]
  goldGained: number
  player: PlayerCombatState
  enemy: EnemyCombatState
}

export interface CombatActivation {
  side: CombatSide
  sourceId: string
}

export interface CombatDamage {
  sourceSide: CombatSide
  targetSide: CombatSide
  sourceId: string
  amount: number
  critical: boolean
  blocked: number
  hpDamage: number
  pierce: boolean
  trueDamage: boolean
  triggersAllowed: boolean
  status?: StatusKind
}

export interface CombatTriggerEvent {
  sourceSide: CombatSide
  sourceId: string
  trigger: CombatTriggerName
  effectType: CombatTriggerEffectType
  value: number
  depth: 1
}

export interface TickResult {
  state: CombatState
  activations: CombatActivation[]
  damages: CombatDamage[]
  triggerEvents: CombatTriggerEvent[]
}

export interface DamageCalculationInput {
  base: number
  flatBonuses?: readonly number[]
  damageMultipliers?: readonly number[]
  critChancePercent: number
  critMultiplier: number
  specialMultiplier?: number
  damageReduction?: number
  randomValue: number
}

export interface DamageCalculation {
  amount: number
  critical: boolean
}

interface TriggerSource {
  side: CombatSide
  sourceId: string
  triggerIndex: number
  effect: CombatTriggerEffect
}

interface TriggerContext {
  attackerSide?: CombatSide
}

const itemById = new Map<string, Item>(items.map((item) => [item.id, item]))
const enemyById = new Map(enemies.map((enemy) => [enemy.id, enemy]))

function normalizeNumber(value: number): number {
  const rounded = Number(value.toFixed(PRECISION_DIGITS))
  return Math.abs(rounded) < EPSILON ? 0 : rounded
}

function roundDamage(value: number): number {
  return normalizeNumber(Math.round(value * DAMAGE_PRECISION_FACTOR) / DAMAGE_PRECISION_FACTOR)
}

function requireFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite`)
  }

  return normalizeNumber(value)
}

function requireFiniteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite non-negative number`)
  }

  return normalizeNumber(value)
}

function requireFinitePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a finite positive number`)
  }

  return normalizeNumber(value)
}

function requireGridCoordinate(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer`)
  }

  return value
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function oppositeSide(side: CombatSide): CombatSide {
  return side === 'player' ? 'enemy' : 'player'
}

function getItemDefinition(itemId: string): Item {
  const item = itemById.get(itemId)

  if (!item) {
    throw new Error(`Unknown item id: ${itemId}`)
  }

  return item
}

function getInitialEnemy(enemyId: string): {
  hp: number
  abilities: readonly EnemyAbility[]
  phaseIndex: number
  tags: readonly EnemyTag[]
} {
  const enemy = enemyById.get(enemyId)

  if (!enemy) {
    throw new Error(`Unknown enemy id: ${enemyId}`)
  }

  if ('phases' in enemy && enemy.phases !== undefined) {
    const firstPhase = enemy.phases[0]

    return {
      hp: firstPhase.hp,
      abilities: firstPhase.abilities,
      phaseIndex: 0,
      tags: enemy.tags ?? [],
    }
  }

  return {
    hp: enemy.hp,
    abilities: enemy.abilities,
    phaseIndex: 0,
    tags: enemy.tags ?? [],
  }
}

function createResolvedModifiers(input?: ResolvedItemModifiersInput): ResolvedItemModifiers {
  return {
    flatDamage: requireFinite(input?.flatDamage ?? 0, 'resolvedModifiers.flatDamage'),
    damageMultiplier: requireFinite(
      input?.damageMultiplier ?? 0,
      'resolvedModifiers.damageMultiplier',
    ),
    critChancePercent: requireFinite(
      input?.critChancePercent ?? 0,
      'resolvedModifiers.critChancePercent',
    ),
    critMultiplier:
      input?.critMultiplier === undefined
        ? null
        : requireFinitePositive(input.critMultiplier, 'resolvedModifiers.critMultiplier'),
    specialMultiplier: requireFiniteNonNegative(
      input?.specialMultiplier ?? 1,
      'resolvedModifiers.specialMultiplier',
    ),
    cooldownMultiplier: requireFinite(
      input?.cooldownMultiplier ?? 0,
      'resolvedModifiers.cooldownMultiplier',
    ),
    staminaMultiplier: requireFinite(
      input?.staminaMultiplier ?? 0,
      'resolvedModifiers.staminaMultiplier',
    ),
    blockFlat: requireFinite(input?.blockFlat ?? 0, 'resolvedModifiers.blockFlat'),
    effectMultiplier: requireFinite(
      input?.effectMultiplier ?? 0,
      'resolvedModifiers.effectMultiplier',
    ),
  }
}

function createCombatTrigger(
  input: TriggerEffect | CombatTriggerEffect,
  label: string,
): CombatTriggerEffect {
  const thresholdPercent =
    input.trigger === 'hpBelow'
      ? requireFiniteNonNegative(
          'thresholdPercent' in input && input.thresholdPercent !== undefined
            ? input.thresholdPercent
            : DEFAULT_HP_BELOW_PERCENT,
          `${label}.thresholdPercent`,
        )
      : undefined

  if (thresholdPercent !== undefined && thresholdPercent > 100) {
    throw new RangeError(`${label}.thresholdPercent must be at most 100`)
  }

  if (input.type === 'applyStatus' && input.status === undefined) {
    throw new Error(`${label}.status is required for applyStatus`)
  }

  return {
    trigger: input.trigger,
    type: input.type,
    value: requireFinite(input.value, `${label}.value`),
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(thresholdPercent === undefined ? {} : { thresholdPercent }),
  }
}

function requireSpecialValue(item: Item): number {
  if (item.specialValue === undefined) {
    throw new Error(`${item.id}.${item.special} requires specialValue`)
  }

  return requireFinite(item.specialValue, `${item.id}.specialValue`)
}

function createItemSpecialTriggers(item: Item): CombatTriggerEffect[] {
  if (item.special === 'guardianHeal') {
    return [
      {
        trigger: 'hpBelow',
        type: 'heal',
        value: requireSpecialValue(item),
        thresholdPercent: GUARDIAN_HEAL_THRESHOLD_PERCENT,
      },
    ]
  }

  if (item.special === 'runMaxHpOnKill') {
    return [
      {
        trigger: 'onKill',
        type: 'maxHp',
        value: requireSpecialValue(item),
      },
    ]
  }

  if (item.special === 'healPercentOnWin') {
    return [
      {
        trigger: 'battleWin',
        type: 'healPercent',
        value: requireSpecialValue(item),
      },
    ]
  }

  return []
}

function createPlayerItemState(input: BuildItemInput): PlayerItemState {
  const item = getItemDefinition(input.itemId)
  const baseCooldown = item.cooldown ?? null

  if (baseCooldown === null && input.initialCooldown !== undefined) {
    throw new Error(`Passive item ${item.id} cannot define an initial cooldown`)
  }

  const dataTriggers = (item.triggers ?? []).map((trigger, index) =>
    createCombatTrigger(trigger, `${input.instanceId}.triggers[${index}]`),
  )
  const resolvedTriggers = (input.resolvedTriggers ?? []).map((trigger, index) =>
    createCombatTrigger(trigger, `${input.instanceId}.resolvedTriggers[${index}]`),
  )
  const specialTriggers = createItemSpecialTriggers(item).map((trigger, index) =>
    createCombatTrigger(trigger, `${input.instanceId}.specialTriggers[${index}]`),
  )

  return {
    instanceId: input.instanceId,
    itemId: item.id,
    position: {
      row: requireGridCoordinate(input.position.row, `${input.instanceId}.position.row`),
      column: requireGridCoordinate(input.position.column, `${input.instanceId}.position.column`),
    },
    size: [item.size[0], item.size[1]],
    rotated: input.rotated ?? false,
    sealed: input.sealed ?? false,
    cooldown:
      baseCooldown === null
        ? 0
        : requireFiniteNonNegative(
            input.initialCooldown ?? baseCooldown,
            `${input.instanceId}.initialCooldown`,
          ),
    baseCooldown,
    staminaCost: item.stamina ?? 0,
    baseStaminaCost: item.stamina ?? 0,
    battleDamageBonus: 0,
    runDamageBonus: requireFiniteNonNegative(
      input.runDamageBonus ?? 0,
      `${input.instanceId}.runDamageBonus`,
    ),
    virtual: false,
    usesDefaultInitialCooldown: input.initialCooldown === undefined,
    effects: item.effects ?? [],
    passives: item.passives ?? [],
    triggers: [...dataTriggers, ...resolvedTriggers, ...specialTriggers],
    modifiers: createResolvedModifiers(input.resolvedModifiers),
  }
}

const SEAL_ADJACENT_OFFSETS = [
  [-1, 0],
  [0, -1],
  [0, 1],
  [1, 0],
] as const

function occupiesCell(item: PlayerItemState, row: number, column: number): boolean {
  return getOccupiedCells(item).some((cell) => cell.row === row && cell.column === column)
}

function resolveSealAdjacent(playerItems: PlayerItemState[]): void {
  const sources = playerItems
    .filter((item) => getItemDefinition(item.itemId).special === 'sealAdjacent')
    .sort(compareGridOrder)

  for (const source of sources) {
    if (source.sealed) {
      continue
    }

    for (const [rowOffset, columnOffset] of SEAL_ADJACENT_OFFSETS) {
      const target = playerItems
        .filter(
          (candidate) =>
            candidate.instanceId !== source.instanceId &&
            !candidate.sealed &&
            occupiesCell(
              candidate,
              source.position.row + rowOffset,
              source.position.column + columnOffset,
            ),
        )
        .sort(compareGridOrder)[0]

      if (target !== undefined) {
        target.sealed = true
        break
      }
    }
  }
}

function compareDuplicateCandidate(left: PlayerItemState, right: PlayerItemState): number {
  const rarityDifference =
    RARITY_RANK[getItemDefinition(right.itemId).rarity] -
    RARITY_RANK[getItemDefinition(left.itemId).rarity]

  return rarityDifference || compareGridOrder(left, right)
}

function createVirtualDuplicate(
  source: PlayerItemState,
  target: PlayerItemState,
): PlayerItemState {
  return {
    ...target,
    instanceId: `${source.instanceId}:duplicate:${target.instanceId}`,
    position: { ...target.position },
    size: [target.size[0], target.size[1]],
    virtual: true,
    duplicateOfInstanceId: target.instanceId,
    duplicatedByInstanceId: source.instanceId,
    triggers: target.triggers.map((trigger) => ({ ...trigger })),
    modifiers: { ...target.modifiers },
  }
}

function resolveDuplicateAdjacent(playerItems: PlayerItemState[]): void {
  const sources = playerItems
    .filter(
      (item) => !item.virtual && getItemDefinition(item.itemId).special === 'duplicateAdjacent',
    )
    .sort(compareGridOrder)

  for (const source of sources) {
    if (source.sealed) {
      continue
    }

    const target = playerItems
      .filter(
        (candidate) =>
          !candidate.virtual &&
          !candidate.sealed &&
          candidate.instanceId !== source.instanceId &&
          areItemsAdjacent(source, candidate),
      )
      .sort(compareDuplicateCandidate)[0]

    if (target !== undefined) {
      playerItems.push(createVirtualDuplicate(source, target))
    }
  }
}

function adjacencyTargetMatches(adjacency: Adjacency, target: Item): boolean {
  return adjacency.target === 'all' || target.tags.includes(adjacency.target)
}

function addAdjacencyTrigger(target: PlayerItemState, adjacency: Adjacency): void {
  if (adjacency.type === 'onHitPoison') {
    target.triggers = [
      ...target.triggers,
      {
        trigger: 'onHit',
        type: 'applyStatus',
        value: adjacency.value,
        status: 'poison',
      },
    ]
  } else if (adjacency.type === 'onHitHeal') {
    target.triggers = [
      ...target.triggers,
      { trigger: 'onHit', type: 'heal', value: adjacency.value },
    ]
  } else if (adjacency.type === 'onHitGold') {
    target.triggers = [
      ...target.triggers,
      { trigger: 'onHit', type: 'gold', value: adjacency.value },
    ]
  }
}

function addAdjacencyModifier(target: PlayerItemState, adjacency: Adjacency): void {
  if (adjacency.type === 'critChance') {
    target.modifiers.critChancePercent = normalizeNumber(
      target.modifiers.critChancePercent + adjacency.value,
    )
  } else if (adjacency.type === 'cdMult') {
    target.modifiers.cooldownMultiplier = normalizeNumber(
      target.modifiers.cooldownMultiplier + adjacency.value,
    )
  } else if (adjacency.type === 'staminaMult') {
    target.modifiers.staminaMultiplier = normalizeNumber(
      target.modifiers.staminaMultiplier + adjacency.value,
    )
  } else if (adjacency.type === 'flatDamage') {
    target.modifiers.flatDamage = normalizeNumber(target.modifiers.flatDamage + adjacency.value)
  } else if (adjacency.type === 'blockFlat') {
    target.modifiers.blockFlat = normalizeNumber(target.modifiers.blockFlat + adjacency.value)
  } else if (adjacency.type === 'effectMult') {
    target.modifiers.effectMultiplier = normalizeNumber(
      target.modifiers.effectMultiplier + adjacency.value,
    )
  }
}

/**
 * Resolves adjacency once over the finalized battle entities. T08 can insert virtual
 * duplicates before invoking this stage; sealed sources are deliberately excluded.
 */
export function applyAdjacencySnapshot(playerItems: PlayerItemState[]): void {
  const orderedSources = [...playerItems].sort(compareGridOrder)

  for (const source of orderedSources) {
    if (source.sealed) {
      continue
    }

    const sourceDefinition = getItemDefinition(source.itemId)

    for (const adjacency of sourceDefinition.adjacency ?? []) {
      for (const target of playerItems) {
        if (target.instanceId === source.instanceId) {
          continue
        }

        const targetDefinition = getItemDefinition(target.itemId)
        if (
          adjacencyTargetMatches(adjacency, targetDefinition) &&
          areItemsAdjacent(source, target, adjacency.range8 ?? false)
        ) {
          addAdjacencyModifier(target, adjacency)
          addAdjacencyTrigger(target, adjacency)
        }
      }
    }
  }

  for (const item of playerItems) {
    item.staminaCost = normalizeNumber(
      Math.max(0, item.baseStaminaCost * (1 + item.modifiers.staminaMultiplier)),
    )
  }
}

function passiveConditionMatches(passive: Passive, player: PlayerCombatState): boolean {
  if (passive.condition === undefined) {
    return true
  }

  if (passive.condition === 'hpBelow50') {
    return player.hp < player.maxHp * 0.5
  }

  return false
}

function getGlobalPassiveTotal(player: PlayerCombatState, type: Passive['type']): number {
  let total = 0

  for (const item of player.items) {
    if (item.sealed) {
      continue
    }

    for (const passive of item.passives) {
      if (
        passive.type === type &&
        passive.selfOnly !== true &&
        passiveConditionMatches(passive, player)
      ) {
        total += passive.value
      }
    }
  }

  return normalizeNumber(total)
}

export function getPlayerDropLuck(state: CombatState): number {
  return getGlobalPassiveTotal(state.player, 'dropLuck')
}

function getSourcePassiveTotal(item: PlayerItemState, type: Passive['type']): number {
  return normalizeNumber(
    item.passives
      .filter((passive) => passive.type === type && passive.selfOnly === true)
      .reduce((total, passive) => total + passive.value, 0),
  )
}

function getSourceCritMultiplier(item: PlayerItemState): number {
  if (item.modifiers.critMultiplier !== null) {
    return item.modifiers.critMultiplier
  }

  const itemOverride = item.passives.find((passive) => passive.type === 'critMultiplier')
  return itemOverride?.value ?? gameConfig.player.critMultiplier
}

export function calculateModifiedCooldown(
  baseCooldown: number,
  modifiers: readonly number[],
): number {
  const validBaseCooldown = requireFiniteNonNegative(baseCooldown, 'baseCooldown')
  const totalModifier = sum(modifiers.map((modifier) => requireFinite(modifier, 'cooldown modifier')))
  const maximumReduction = gameConfig.player.maximumCooldownReductionPercent / 100
  const cappedModifier = Math.max(-maximumReduction, totalModifier)
  const modifiedCooldown = validBaseCooldown * (1 + cappedModifier)

  return normalizeNumber(Math.max(gameConfig.player.minimumCooldownSeconds, modifiedCooldown))
}

function calculatePlayerItemCooldown(state: CombatState, item: PlayerItemState): number {
  if (item.baseCooldown === null) {
    return 0
  }

  const sourceCdMultiplier = item.passives
    .filter((passive) => passive.type === 'cdMult')
    .reduce((total, passive) => total + passive.value, 0)

  return calculateModifiedCooldown(item.baseCooldown, [
    getGlobalPassiveTotal(state.player, 'allCdMult'),
    sourceCdMultiplier,
    item.modifiers.cooldownMultiplier,
  ])
}

export function calculateDamage(input: DamageCalculationInput): DamageCalculation {
  const base = requireFiniteNonNegative(input.base, 'damage.base')
  const flatDamage = sum(
    (input.flatBonuses ?? []).map((bonus) => requireFinite(bonus, 'flat damage bonus')),
  )
  const multiplierTotal = sum(
    (input.damageMultipliers ?? []).map((modifier) =>
      requireFinite(modifier, 'damage multiplier'),
    ),
  )
  const critChancePercent = Math.min(
    100,
    Math.max(0, requireFinite(input.critChancePercent, 'crit chance percent')),
  )
  const critMultiplier = requireFinitePositive(input.critMultiplier, 'crit multiplier')
  const specialMultiplier = requireFiniteNonNegative(
    input.specialMultiplier ?? 1,
    'special multiplier',
  )
  const damageReduction = requireFiniteNonNegative(
    input.damageReduction ?? 0,
    'damage reduction',
  )
  const randomValue = requireFinite(input.randomValue, 'random value')

  if (randomValue < 0 || randomValue >= 1) {
    throw new RangeError('random value must be in the half-open range [0, 1)')
  }

  const critical = randomValue < critChancePercent / 100
  const additiveDamage = base + flatDamage
  const multipliedDamage = additiveDamage * (1 + multiplierTotal)
  const criticalDamage = multipliedDamage * (critical ? critMultiplier : 1)
  const specialDamage = criticalDamage * specialMultiplier
  const reducedDamage = Math.max(0, specialDamage - damageReduction)

  return {
    amount: roundDamage(reducedDamage),
    critical,
  }
}

export function createCombatState(setup: CombatSetup): CombatState {
  const instanceIds = new Set<string>()
  const playerItemEntries = setup.build.map((input) => {
    if (instanceIds.has(input.instanceId)) {
      throw new Error(`Duplicate item instance id: ${input.instanceId}`)
    }

    instanceIds.add(input.instanceId)
    return { input, state: createPlayerItemState(input) }
  })

  const playerMaxHp = requireFiniteNonNegative(
    setup.player?.maxHp ?? gameConfig.player.initialHp,
    'player.maxHp',
  )
  const playerHp = Math.min(
    requireFiniteNonNegative(setup.player?.hp ?? playerMaxHp, 'player.hp'),
    playerMaxHp,
  )
  const playerBlockCap = requireFiniteNonNegative(
    setup.player?.blockCap ?? gameConfig.player.blockCap,
    'player.blockCap',
  )
  const staminaCap = requireFiniteNonNegative(
    setup.player?.staminaCap ?? gameConfig.player.staminaCap,
    'player.staminaCap',
  )

  const initialEnemy = getInitialEnemy(setup.enemyId)
  const enemyMaxHp = requireFiniteNonNegative(
    setup.enemy?.maxHp ?? setup.enemy?.hp ?? initialEnemy.hp,
    'enemy.maxHp',
  )
  const enemyHp = Math.min(
    requireFiniteNonNegative(setup.enemy?.hp ?? enemyMaxHp, 'enemy.hp'),
    enemyMaxHp,
  )
  const enemyBlockCap = requireFiniteNonNegative(
    setup.enemy?.blockCap ?? Number.MAX_SAFE_INTEGER,
    'enemy.blockCap',
  )
  const enemyTriggers = (setup.enemy?.triggers ?? []).map((trigger, index) =>
    createCombatTrigger(trigger, `enemy.triggers[${index}]`),
  )

  const playerItems = playerItemEntries.map((entry) => entry.state)
  resolveSealAdjacent(playerItems)
  resolveDuplicateAdjacent(playerItems)
  applyAdjacencySnapshot(playerItems)

  const state: CombatState = {
    tick: 0,
    time: 0,
    result: 'ongoing',
    rngState: normalizeSeed(setup.seed),
    battleStarted: false,
    terminalTriggersResolved: false,
    consumedTriggerKeys: [],
    goldGained: 0,
    player: {
      hp: playerHp,
      maxHp: playerMaxHp,
      block: Math.min(
        requireFiniteNonNegative(setup.player?.block ?? 0, 'player.block'),
        playerBlockCap,
      ),
      blockCap: playerBlockCap,
      stamina: Math.min(
        requireFiniteNonNegative(setup.player?.stamina ?? staminaCap, 'player.stamina'),
        staminaCap,
      ),
      staminaCap,
      staminaRegenPerSecond: requireFiniteNonNegative(
        setup.player?.staminaRegenPerSecond ?? gameConfig.player.staminaRegenPerSecond,
        'player.staminaRegenPerSecond',
      ),
      statuses: createStatusState(setup.player?.statuses),
      items: playerItems,
    },
    enemy: {
      id: setup.enemyId,
      hp: enemyHp,
      maxHp: enemyMaxHp,
      block: Math.min(
        requireFiniteNonNegative(setup.enemy?.block ?? 0, 'enemy.block'),
        enemyBlockCap,
      ),
      blockCap: enemyBlockCap,
      phaseIndex: initialEnemy.phaseIndex,
      tags: initialEnemy.tags,
      statuses: createStatusState(setup.enemy?.statuses),
      abilities: initialEnemy.abilities.map((ability, index) => ({
        index,
        name: ability.name,
        cooldown: requireFiniteNonNegative(
          setup.enemy?.initialCooldowns?.[index] ?? ability.cooldown,
          `enemy.initialCooldowns[${index}]`,
        ),
        baseCooldown: ability.cooldown,
        effects: ability.effects,
      })),
      triggers: enemyTriggers,
    },
  }

  for (const item of state.player.items) {
    if (item.usesDefaultInitialCooldown && item.baseCooldown !== null) {
      item.cooldown = calculatePlayerItemCooldown(state, item)
    }
  }

  return state
}

function cloneCombatState(state: CombatState): CombatState {
  return {
    ...state,
    consumedTriggerKeys: [...state.consumedTriggerKeys],
    player: {
      ...state.player,
      statuses: cloneStatusState(state.player.statuses),
      items: state.player.items.map((item) => ({
        ...item,
        position: { ...item.position },
        size: [item.size[0], item.size[1]],
        triggers: item.triggers.map((trigger) => ({ ...trigger })),
        modifiers: { ...item.modifiers },
      })),
    },
    enemy: {
      ...state.enemy,
      statuses: cloneStatusState(state.enemy.statuses),
      abilities: state.enemy.abilities.map((ability) => ({ ...ability })),
    },
  }
}

function decrementCooldown(cooldown: number, progress = TICK_SECONDS): number {
  return normalizeNumber(Math.max(0, cooldown - progress))
}

function applyBlock(target: { block: number; blockCap: number }, amount: number): void {
  if (amount <= 0) {
    return
  }

  target.block = normalizeNumber(Math.min(target.blockCap, target.block + amount))
}

function applyHeal(target: { hp: number; maxHp: number }, amount: number): void {
  if (amount <= 0) {
    return
  }

  target.hp = normalizeNumber(Math.min(target.maxHp, target.hp + amount))
}

function applyDamage(
  target: { hp: number; block: number },
  amount: number,
  pierce: boolean,
): { blocked: number; hpDamage: number } {
  if (amount <= 0) {
    return { blocked: 0, hpDamage: 0 }
  }

  const blocked = pierce ? 0 : Math.min(target.block, amount)
  const hpDamage = normalizeNumber(amount - blocked)

  if (!pierce) {
    target.block = normalizeNumber(target.block - blocked)
  }
  target.hp = normalizeNumber(target.hp - hpDamage)

  return { blocked: normalizeNumber(blocked), hpDamage }
}

function getSideState(state: CombatState, side: CombatSide): PlayerCombatState | EnemyCombatState {
  return side === 'player' ? state.player : state.enemy
}

function compareGridOrder(left: PlayerItemState, right: PlayerItemState): number {
  const positionDifference =
    left.position.row - right.position.row || left.position.column - right.position.column

  if (positionDifference !== 0) {
    return positionDifference
  }

  if (left.duplicateOfInstanceId === right.instanceId) {
    return 1
  }

  if (right.duplicateOfInstanceId === left.instanceId) {
    return -1
  }

  if (left.virtual !== right.virtual) {
    return left.virtual ? 1 : -1
  }

  return left.instanceId.localeCompare(right.instanceId)
}

function getAllTriggerSources(
  state: CombatState,
  side: CombatSide,
  trigger: CombatTriggerName,
): TriggerSource[] {
  if (side === 'enemy') {
    return state.enemy.triggers.flatMap((effect, triggerIndex) =>
      effect.trigger === trigger
        ? [{ side, sourceId: state.enemy.id, triggerIndex, effect }]
        : [],
    )
  }

  return [...state.player.items]
    .sort(compareGridOrder)
    .flatMap((item) => getItemTriggerSources(item, trigger))
}

function getItemTriggerSources(
  item: PlayerItemState,
  trigger: CombatTriggerName,
): TriggerSource[] {
  if (item.sealed) {
    return []
  }

  return item.triggers.flatMap((effect, triggerIndex) =>
    effect.trigger === trigger
      ? [{ side: 'player', sourceId: item.instanceId, triggerIndex, effect }]
      : [],
  )
}

function getOnHitTriggerSources(
  state: CombatState,
  side: CombatSide,
  sourceId: string,
): TriggerSource[] {
  if (side === 'enemy') {
    return getAllTriggerSources(state, side, 'onHit')
  }

  const item = state.player.items.find((candidate) => candidate.instanceId === sourceId)

  if (!item || item.sealed) {
    return []
  }

  return getItemTriggerSources(item, 'onHit')
}

function takeRandom(state: CombatState): number {
  const step = nextMulberry32(state.rngState)
  state.rngState = step.state
  return step.value
}

function pushNormalDamage(
  damages: CombatDamage[],
  input: Omit<CombatDamage, 'trueDamage' | 'triggersAllowed'>,
): CombatDamage {
  const damage = { ...input, trueDamage: false, triggersAllowed: true }
  damages.push(damage)
  return damage
}

function pushTriggeredDamage(
  damages: CombatDamage[],
  input: Omit<CombatDamage, 'trueDamage' | 'triggersAllowed'>,
): CombatDamage {
  const damage = { ...input, trueDamage: false, triggersAllowed: false }
  damages.push(damage)
  return damage
}

function triggerKey(source: TriggerSource): string {
  return `${source.side}:${source.sourceId}:${source.triggerIndex}:${source.effect.trigger}`
}

function resolveTriggerSources(
  state: CombatState,
  sources: readonly TriggerSource[],
  context: TriggerContext,
  damages: CombatDamage[],
  triggerEvents: CombatTriggerEvent[],
): void {
  for (const source of sources) {
    if (
      state.result !== 'ongoing' &&
      source.effect.trigger !== 'onKill' &&
      source.effect.trigger !== 'battleWin' &&
      source.effect.trigger !== 'onHit'
    ) {
      return
    }

    triggerEvents.push({
      sourceSide: source.side,
      sourceId: source.sourceId,
      trigger: source.effect.trigger,
      effectType: source.effect.type,
      value: source.effect.value,
      depth: 1,
    })

    executeTriggerEffect(state, source, context, damages, triggerEvents)
  }
}

function resolveTerminalTriggers(
  state: CombatState,
  winnerSide: CombatSide,
  damages: CombatDamage[],
  triggerEvents: CombatTriggerEvent[],
): void {
  if (state.terminalTriggersResolved) {
    return
  }

  state.terminalTriggersResolved = true
  resolveTriggerSources(
    state,
    getAllTriggerSources(state, winnerSide, 'onKill'),
    {},
    damages,
    triggerEvents,
  )
  resolveTriggerSources(
    state,
    getAllTriggerSources(state, winnerSide, 'battleWin'),
    {},
    damages,
    triggerEvents,
  )
}

function updateResultAndResolveTerminal(
  state: CombatState,
  damages: CombatDamage[],
  triggerEvents: CombatTriggerEvent[],
): void {
  if (state.enemy.hp <= 0) {
    state.result = 'playerVictory'
    resolveTerminalTriggers(state, 'player', damages, triggerEvents)
  } else if (state.player.hp <= 0) {
    state.result = 'playerDefeat'
    resolveTerminalTriggers(state, 'enemy', damages, triggerEvents)
  }
}

function executeTriggerEffect(
  state: CombatState,
  source: TriggerSource,
  context: TriggerContext,
  damages: CombatDamage[],
  triggerEvents: CombatTriggerEvent[],
): void {
  const owner = getSideState(state, source.side)
  const opponentSide = oppositeSide(source.side)
  const opponent = getSideState(state, opponentSide)

  if (source.effect.type === 'maxHp') {
    owner.maxHp = normalizeNumber(Math.max(0, owner.maxHp + source.effect.value))
    owner.hp = Math.min(owner.hp, owner.maxHp)
    return
  }

  if (source.effect.type === 'healPercent') {
    applyHeal(owner, owner.maxHp * (source.effect.value / 100))
    return
  }

  if (source.effect.type === 'heal') {
    applyHeal(owner, source.effect.value)
    return
  }

  if (source.effect.type === 'block') {
    applyBlock(owner, source.effect.value)
    return
  }

  if (source.effect.type === 'gold') {
    if (source.side === 'player') {
      state.goldGained = normalizeNumber(state.goldGained + source.effect.value)
    }
    return
  }

  if (source.effect.type === 'applyStatus') {
    if (source.effect.status !== undefined) {
      applyStatus(opponent.statuses, source.effect.status, source.effect.value)
    }
    return
  }

  const targetSide =
    source.effect.type === 'reflect' && context.attackerSide !== undefined
      ? context.attackerSide
      : opponentSide
  const target = getSideState(state, targetSide)
  const amount = Math.max(0, source.effect.value)
  const applied = applyDamage(target, amount, false)

  pushTriggeredDamage(damages, {
    sourceSide: source.side,
    targetSide,
    sourceId: source.sourceId,
    amount,
    critical: false,
    blocked: applied.blocked,
    hpDamage: applied.hpDamage,
    pierce: false,
  })
  updateResultAndResolveTerminal(state, damages, triggerEvents)
}

function resolveHpBelowCrossing(
  state: CombatState,
  targetSide: CombatSide,
  beforeHp: number,
  afterHp: number,
  damages: CombatDamage[],
  triggerEvents: CombatTriggerEvent[],
): void {
  for (const source of getAllTriggerSources(state, targetSide, 'hpBelow')) {
    const key = triggerKey(source)
    const threshold =
      getSideState(state, targetSide).maxHp *
      ((source.effect.thresholdPercent ?? DEFAULT_HP_BELOW_PERCENT) / 100)

    if (
      state.consumedTriggerKeys.includes(key) ||
      beforeHp < threshold ||
      afterHp >= threshold
    ) {
      continue
    }

    state.consumedTriggerKeys.push(key)
    resolveTriggerSources(state, [source], {}, damages, triggerEvents)
  }
}

function applyDirectDamage(
  state: CombatState,
  input: {
    sourceSide: CombatSide
    targetSide: CombatSide
    sourceId: string
    amount: number
    critical: boolean
    pierce: boolean
  },
  damages: CombatDamage[],
  triggerEvents: CombatTriggerEvent[],
): void {
  const target = getSideState(state, input.targetSide)
  const beforeHp = target.hp
  const applied = applyDamage(target, input.amount, input.pierce)
  const afterHp = target.hp
  const damage = pushNormalDamage(damages, {
    ...input,
    blocked: applied.blocked,
    hpDamage: applied.hpDamage,
  })

  if (afterHp <= 0) {
    state.result = input.targetSide === 'enemy' ? 'playerVictory' : 'playerDefeat'
  }

  resolveTriggerSources(
    state,
    getOnHitTriggerSources(state, damage.sourceSide, damage.sourceId),
    {},
    damages,
    triggerEvents,
  )

  if (afterHp <= 0) {
    resolveTerminalTriggers(state, input.sourceSide, damages, triggerEvents)
    return
  }

  if (state.result !== 'ongoing') {
    return
  }

  if (damage.blocked > 0 || damage.hpDamage > 0) {
    resolveTriggerSources(
      state,
      getAllTriggerSources(state, damage.targetSide, 'onDamaged'),
      { attackerSide: damage.sourceSide },
      damages,
      triggerEvents,
    )
  }

  if (state.result !== 'ongoing') {
    return
  }

  if (damage.amount > 0 && damage.blocked === damage.amount && damage.hpDamage === 0) {
    resolveTriggerSources(
      state,
      getAllTriggerSources(state, damage.targetSide, 'onBlocked'),
      { attackerSide: damage.sourceSide },
      damages,
      triggerEvents,
    )
  }

  if (state.result !== 'ongoing') {
    return
  }

  resolveHpBelowCrossing(
    state,
    damage.targetSide,
    beforeHp,
    afterHp,
    damages,
    triggerEvents,
  )
}

function applyTrueStatusDamage(
  state: CombatState,
  targetSide: CombatSide,
  status: 'poison' | 'burn',
  amount: number,
  damages: CombatDamage[],
  triggerEvents: CombatTriggerEvent[],
): void {
  if (amount <= 0 || state.result !== 'ongoing') {
    return
  }

  const target = getSideState(state, targetSide)
  const beforeHp = target.hp
  const applied = applyDamage(target, amount, true)
  const afterHp = target.hp

  damages.push({
    sourceSide: oppositeSide(targetSide),
    targetSide,
    sourceId: `status:${status}`,
    amount: normalizeNumber(amount),
    critical: false,
    blocked: applied.blocked,
    hpDamage: applied.hpDamage,
    pierce: true,
    trueDamage: true,
    triggersAllowed: false,
    status,
  })

  if (afterHp <= 0) {
    updateResultAndResolveTerminal(state, damages, triggerEvents)
    return
  }

  resolveHpBelowCrossing(state, targetSide, beforeHp, afterHp, damages, triggerEvents)
}

function resolveStatusDamageForSide(
  state: CombatState,
  targetSide: CombatSide,
  damages: CombatDamage[],
  triggerEvents: CombatTriggerEvent[],
): void {
  const statuses = getSideState(state, targetSide).statuses

  // Poison before burn is the provisional within-entity ordering recorded in SPEC_TODO.
  applyTrueStatusDamage(
    state,
    targetSide,
    'poison',
    statuses.poisonStacks,
    damages,
    triggerEvents,
  )
  applyTrueStatusDamage(
    state,
    targetSide,
    'burn',
    getBurnStacks(statuses),
    damages,
    triggerEvents,
  )
}

function resolveIntegerSecondStatusDamage(
  state: CombatState,
  damages: CombatDamage[],
  triggerEvents: CombatTriggerEvent[],
): void {
  if (state.tick % TICKS_PER_SECOND !== 0) {
    return
  }

  // COMBAT_SPEC §3: Player status damage is resolved before Enemy status damage.
  resolveStatusDamageForSide(state, 'player', damages, triggerEvents)
  resolveStatusDamageForSide(state, 'enemy', damages, triggerEvents)
}

function resolveItemBattleStartSpecial(state: CombatState, item: PlayerItemState): void {
  const special = getItemDefinition(item.itemId).special

  if (special === 'openingShot' && item.baseCooldown !== null) {
    item.cooldown = 0
  } else if (special === 'readyAllCooldowns') {
    for (const candidate of state.player.items) {
      if (candidate.baseCooldown !== null) {
        candidate.cooldown = 0
      }
    }
  }
}

function resolveBattleStart(
  state: CombatState,
  damages: CombatDamage[],
  triggerEvents: CombatTriggerEvent[],
): void {
  if (state.battleStarted) {
    return
  }

  state.battleStarted = true
  // Structural sealing/duplication and adjacency snapshots are finalized during state creation.
  for (const item of [...state.player.items].sort(compareGridOrder)) {
    if (item.sealed || state.result !== 'ongoing') {
      continue
    }

    resolveItemBattleStartSpecial(state, item)
    resolveTriggerSources(
      state,
      getItemTriggerSources(item, 'battleStart'),
      {},
      damages,
      triggerEvents,
    )
  }

  resolveTriggerSources(
    state,
    getAllTriggerSources(state, 'enemy', 'battleStart'),
    {},
    damages,
    triggerEvents,
  )
}

function getItemSpecialDamageMultiplier(state: CombatState, item: PlayerItemState): number {
  const definition = getItemDefinition(item.itemId)

  if (
    definition.special === 'execute' &&
    state.enemy.hp <= state.enemy.maxHp * 0.5
  ) {
    return requireSpecialValue(definition)
  }

  if (definition.special === 'undeadSlayer' && state.enemy.tags.includes('undead')) {
    return requireSpecialValue(definition)
  }

  return 1
}

function getItemSpecialFlatDamage(state: CombatState, item: PlayerItemState): number {
  const definition = getItemDefinition(item.itemId)
  let bonus = 0

  if (definition.special === 'battleScalingDamage') {
    bonus += item.battleDamageBonus
  } else if (definition.special === 'runScalingDamage') {
    bonus += item.runDamageBonus
  } else if (definition.special === 'poisonFinisher') {
    bonus += state.enemy.statuses.poisonStacks * requireSpecialValue(definition)
  }

  return normalizeNumber(bonus)
}

function advanceItemDamageScaling(item: PlayerItemState): void {
  const definition = getItemDefinition(item.itemId)

  if (definition.special === 'battleScalingDamage') {
    item.battleDamageBonus = normalizeNumber(
      item.battleDamageBonus + requireSpecialValue(definition),
    )
  } else if (definition.special === 'runScalingDamage') {
    item.runDamageBonus = normalizeNumber(item.runDamageBonus + requireSpecialValue(definition))
  }
}

function resolvePlayerEffects(
  state: CombatState,
  source: PlayerItemState,
  damages: CombatDamage[],
  triggerEvents: CombatTriggerEvent[],
): void {
  const effectMultiplier = Math.max(0, 1 + source.modifiers.effectMultiplier)

  for (const effect of source.effects) {
    if (effect.type === 'damage' && effect.value !== undefined) {
      const calculation = calculateDamage({
        base: effect.value * effectMultiplier,
        flatBonuses: [source.modifiers.flatDamage, getItemSpecialFlatDamage(state, source)],
        damageMultipliers: [
          getGlobalPassiveTotal(state.player, 'damageMult'),
          source.modifiers.damageMultiplier,
        ],
        critChancePercent:
          gameConfig.player.baseCritChancePercent +
          getGlobalPassiveTotal(state.player, 'critChance') +
          getSourcePassiveTotal(source, 'critChance') +
          source.modifiers.critChancePercent,
        critMultiplier: getSourceCritMultiplier(source),
        specialMultiplier:
          source.modifiers.specialMultiplier * getItemSpecialDamageMultiplier(state, source),
        damageReduction: 0,
        randomValue: takeRandom(state),
      })

      applyDirectDamage(
        state,
        {
          sourceSide: 'player',
          targetSide: 'enemy',
          sourceId: source.instanceId,
          amount: calculation.amount,
          critical: calculation.critical,
          pierce: effect.pierce ?? false,
        },
        damages,
        triggerEvents,
      )
      advanceItemDamageScaling(source)
    } else if (effect.type === 'block' && effect.value !== undefined) {
      applyBlock(state.player, effect.value * effectMultiplier + source.modifiers.blockFlat)
    } else if (effect.type === 'heal' && effect.value !== undefined) {
      applyHeal(state.player, effect.value * effectMultiplier)
    } else if (
      effect.type === 'applyStatus' &&
      effect.status !== undefined &&
      effect.value !== undefined
    ) {
      applyStatus(state.enemy.statuses, effect.status, effect.value * effectMultiplier)
    } else if (effect.type === 'cleanseSelf') {
      cleansePoisonAndBurn(state.player.statuses)
    }

    if (state.result !== 'ongoing') {
      return
    }
  }
}

function resolveEnemyEffects(
  state: CombatState,
  source: EnemyAbilityState,
  damages: CombatDamage[],
  triggerEvents: CombatTriggerEvent[],
): void {
  for (const effect of source.effects) {
    if (effect.type === 'damage') {
      const calculation = calculateDamage({
        base: effect.value,
        critChancePercent: 0,
        critMultiplier: 1,
        damageReduction: getGlobalPassiveTotal(state.player, 'damageReduction'),
        randomValue: takeRandom(state),
      })

      applyDirectDamage(
        state,
        {
          sourceSide: 'enemy',
          targetSide: 'player',
          sourceId: `${state.enemy.id}:ability:${source.index}`,
          amount: calculation.amount,
          critical: calculation.critical,
          pierce: false,
        },
        damages,
        triggerEvents,
      )
    } else if (
      effect.type === 'applyStatus' &&
      effect.status !== undefined &&
      effect.value !== undefined
    ) {
      applyStatus(state.player.statuses, effect.status, effect.value)
    }

    if (state.result !== 'ongoing') {
      return
    }
  }
}

function activatePlayerItems(
  state: CombatState,
  activations: CombatActivation[],
  damages: CombatDamage[],
  triggerEvents: CombatTriggerEvent[],
): void {
  const orderedItems = [...state.player.items].sort(compareGridOrder)

  for (const item of orderedItems) {
    if (state.result !== 'ongoing') {
      return
    }

    if (
      item.baseCooldown === null ||
      item.sealed ||
      item.cooldown > EPSILON ||
      item.staminaCost > state.player.stamina + EPSILON
    ) {
      continue
    }

    state.player.stamina = normalizeNumber(state.player.stamina - item.staminaCost)
    item.cooldown = calculatePlayerItemCooldown(state, item)
    activations.push({ side: 'player', sourceId: item.instanceId })
    resolvePlayerEffects(state, item, damages, triggerEvents)
  }
}

function activateEnemyAbilities(
  state: CombatState,
  activations: CombatActivation[],
  damages: CombatDamage[],
  triggerEvents: CombatTriggerEvent[],
): void {
  for (const ability of state.enemy.abilities) {
    if (state.result !== 'ongoing') {
      return
    }

    if (ability.cooldown > EPSILON) {
      continue
    }

    ability.cooldown = calculateModifiedCooldown(ability.baseCooldown, [])
    activations.push({
      side: 'enemy',
      sourceId: `${state.enemy.id}:ability:${ability.index}`,
    })
    resolveEnemyEffects(state, ability, damages, triggerEvents)
  }
}

export function stepCombat(state: CombatState): TickResult {
  if (state.result !== 'ongoing') {
    return { state, activations: [], damages: [], triggerEvents: [] }
  }

  const nextState = cloneCombatState(state)
  const activations: CombatActivation[] = []
  const damages: CombatDamage[] = []
  const triggerEvents: CombatTriggerEvent[] = []

  resolveBattleStart(nextState, damages, triggerEvents)
  if (nextState.result !== 'ongoing') {
    return { state: nextState, activations, damages, triggerEvents }
  }

  // §3.1: advance the integer tick first; derive time to avoid accumulated drift.
  nextState.tick += 1
  nextState.time = normalizeNumber(nextState.tick * TICK_SECONDS)

  // §3.2: status True damage at integer seconds, Player then Enemy.
  resolveIntegerSecondStatusDamage(nextState, damages, triggerEvents)
  if (nextState.result !== 'ongoing') {
    return { state: nextState, activations, damages, triggerEvents }
  }

  // §3.3 sudden death is introduced with enemy traits in T09.

  // §3.4 player stamina recovery.
  nextState.player.stamina = normalizeNumber(
    Math.min(
      nextState.player.staminaCap,
      nextState.player.stamina + nextState.player.staminaRegenPerSecond * TICK_SECONDS,
    ),
  )

  // §3.5 all cooldowns advance before either activation phase. Slow changes 0.1 to 0.08.
  const playerCooldownProgress =
    TICK_SECONDS *
    (isSlowed(nextState.player.statuses) ? SLOW_COOLDOWN_PROGRESS_MULTIPLIER : 1)
  const enemyCooldownProgress =
    TICK_SECONDS *
    (isSlowed(nextState.enemy.statuses) ? SLOW_COOLDOWN_PROGRESS_MULTIPLIER : 1)

  for (const item of nextState.player.items) {
    item.cooldown = decrementCooldown(item.cooldown, playerCooldownProgress)
  }
  for (const ability of nextState.enemy.abilities) {
    ability.cooldown = decrementCooldown(ability.cooldown, enemyCooldownProgress)
  }

  // Existing timed statuses advance before action phases; new applications retain full duration.
  advanceStatusDurations(nextState.player.statuses)
  advanceStatusDurations(nextState.enemy.statuses)

  // §3.6-7: player grid order, then enemy ability array order.
  activatePlayerItems(nextState, activations, damages, triggerEvents)
  activateEnemyAbilities(nextState, activations, damages, triggerEvents)

  return { state: nextState, activations, damages, triggerEvents }
}

export function runTicks(initialState: CombatState, count: number): CombatState {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError('Tick count must be a non-negative integer')
  }

  let state = initialState

  for (let index = 0; index < count && state.result === 'ongoing'; index += 1) {
    state = stepCombat(state).state
  }

  return state
}
