import { enemies, gameConfig, items } from '../data'
import type { ActiveEffect, EnemyAbility, EnemyEffect, Item, Passive } from '../data/schema'
import { nextMulberry32, normalizeSeed, type Seed } from './rng'

export const TICK_SECONDS = 0.1
const EPSILON = 1e-9
const PRECISION_DIGITS = 10
const DAMAGE_PRECISION_FACTOR = 10

export type CombatResult = 'ongoing' | 'playerVictory' | 'playerDefeat'
export type CombatSide = 'player' | 'enemy'

export interface GridPosition {
  row: number
  column: number
}

export interface ResolvedItemModifiersInput {
  flatDamage?: number
  damageMultiplier?: number
  critChancePercent?: number
  critMultiplier?: number
  specialMultiplier?: number
  cooldownMultiplier?: number
}

export interface BuildItemInput {
  instanceId: string
  itemId: string
  position: GridPosition
  sealed?: boolean
  initialCooldown?: number
  resolvedModifiers?: ResolvedItemModifiersInput
}

export interface PlayerSetupOverrides {
  maxHp?: number
  hp?: number
  block?: number
  blockCap?: number
  stamina?: number
  staminaCap?: number
  staminaRegenPerSecond?: number
}

export interface EnemySetupOverrides {
  hp?: number
  block?: number
  blockCap?: number
  initialCooldowns?: readonly number[]
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
}

export interface PlayerItemState {
  instanceId: string
  itemId: string
  position: GridPosition
  sealed: boolean
  cooldown: number
  baseCooldown: number | null
  staminaCost: number
  effects: readonly ActiveEffect[]
  passives: readonly Passive[]
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
  items: PlayerItemState[]
}

export interface EnemyCombatState {
  id: string
  hp: number
  maxHp: number
  block: number
  blockCap: number
  phaseIndex: number
  abilities: EnemyAbilityState[]
}

export interface CombatState {
  tick: number
  time: number
  result: CombatResult
  rngState: number
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
}

export interface TickResult {
  state: CombatState
  activations: CombatActivation[]
  damages: CombatDamage[]
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
} {
  const enemy = enemyById.get(enemyId)

  if (!enemy) {
    throw new Error(`Unknown enemy id: ${enemyId}`)
  }

  if ('phases' in enemy) {
    const firstPhase = enemy.phases[0]

    return {
      hp: firstPhase.hp,
      abilities: firstPhase.abilities,
      phaseIndex: 0,
    }
  }

  return {
    hp: enemy.hp,
    abilities: enemy.abilities,
    phaseIndex: 0,
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
  }
}

function createPlayerItemState(input: BuildItemInput): PlayerItemState {
  const item = getItemDefinition(input.itemId)
  const baseCooldown = item.cooldown ?? null

  if (baseCooldown === null && input.initialCooldown !== undefined) {
    throw new Error(`Passive item ${item.id} cannot define an initial cooldown`)
  }

  return {
    instanceId: input.instanceId,
    itemId: item.id,
    position: {
      row: requireGridCoordinate(input.position.row, `${input.instanceId}.position.row`),
      column: requireGridCoordinate(input.position.column, `${input.instanceId}.position.column`),
    },
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
    effects: item.effects ?? [],
    passives: item.passives ?? [],
    modifiers: createResolvedModifiers(input.resolvedModifiers),
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
    return {
      input,
      state: createPlayerItemState(input),
    }
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
  const enemyMaxHp = requireFiniteNonNegative(setup.enemy?.hp ?? initialEnemy.hp, 'enemy.hp')
  const enemyBlockCap = requireFiniteNonNegative(
    setup.enemy?.blockCap ?? Number.MAX_SAFE_INTEGER,
    'enemy.blockCap',
  )

  const state: CombatState = {
    tick: 0,
    time: 0,
    result: 'ongoing',
    rngState: normalizeSeed(setup.seed),
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
      items: playerItemEntries.map((entry) => entry.state),
    },
    enemy: {
      id: setup.enemyId,
      hp: enemyMaxHp,
      maxHp: enemyMaxHp,
      block: Math.min(
        requireFiniteNonNegative(setup.enemy?.block ?? 0, 'enemy.block'),
        enemyBlockCap,
      ),
      blockCap: enemyBlockCap,
      phaseIndex: initialEnemy.phaseIndex,
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
    },
  }

  for (const entry of playerItemEntries) {
    if (entry.input.initialCooldown === undefined && entry.state.baseCooldown !== null) {
      entry.state.cooldown = calculatePlayerItemCooldown(state, entry.state)
    }
  }

  return state
}

function cloneCombatState(state: CombatState): CombatState {
  return {
    ...state,
    player: {
      ...state.player,
      items: state.player.items.map((item) => ({
        ...item,
        position: { ...item.position },
        modifiers: { ...item.modifiers },
      })),
    },
    enemy: {
      ...state.enemy,
      abilities: state.enemy.abilities.map((ability) => ({ ...ability })),
    },
  }
}

function decrementCooldown(cooldown: number): number {
  return normalizeNumber(Math.max(0, cooldown - TICK_SECONDS))
}

function applyBlock(target: { block: number; blockCap: number }, amount: number): void {
  if (amount <= 0) {
    return
  }

  target.block = normalizeNumber(Math.min(target.blockCap, target.block + amount))
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

function updateResultAfterDamage(state: CombatState): void {
  if (state.enemy.hp <= 0) {
    state.result = 'playerVictory'
  } else if (state.player.hp <= 0) {
    state.result = 'playerDefeat'
  }
}

function takeRandom(state: CombatState): number {
  const step = nextMulberry32(state.rngState)
  state.rngState = step.state
  return step.value
}

function resolvePlayerEffects(
  state: CombatState,
  source: PlayerItemState,
  damages: CombatDamage[],
): void {
  for (const effect of source.effects) {
    if (effect.type === 'damage' && effect.value !== undefined) {
      const calculation = calculateDamage({
        base: effect.value,
        flatBonuses: [source.modifiers.flatDamage],
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
        specialMultiplier: source.modifiers.specialMultiplier,
        damageReduction: 0,
        randomValue: takeRandom(state),
      })
      const pierce = effect.pierce ?? false
      const applied = applyDamage(state.enemy, calculation.amount, pierce)

      damages.push({
        sourceSide: 'player',
        targetSide: 'enemy',
        sourceId: source.instanceId,
        amount: calculation.amount,
        critical: calculation.critical,
        blocked: applied.blocked,
        hpDamage: applied.hpDamage,
        pierce,
      })
      updateResultAfterDamage(state)
      // T06 attaches onHit/onDamaged processing at this post-application boundary.
    } else if (effect.type === 'block' && effect.value !== undefined) {
      applyBlock(state.player, effect.value)
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
      const applied = applyDamage(state.player, calculation.amount, false)

      damages.push({
        sourceSide: 'enemy',
        targetSide: 'player',
        sourceId: `${state.enemy.id}:ability:${source.index}`,
        amount: calculation.amount,
        critical: calculation.critical,
        blocked: applied.blocked,
        hpDamage: applied.hpDamage,
        pierce: false,
      })
      updateResultAfterDamage(state)
      // T06 attaches onHit/onDamaged processing at this post-application boundary.
    }

    if (state.result !== 'ongoing') {
      return
    }
  }
}

function compareGridOrder(left: PlayerItemState, right: PlayerItemState): number {
  return (
    left.position.row - right.position.row ||
    left.position.column - right.position.column ||
    left.instanceId.localeCompare(right.instanceId)
  )
}

function activatePlayerItems(
  state: CombatState,
  activations: CombatActivation[],
  damages: CombatDamage[],
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
    resolvePlayerEffects(state, item, damages)
  }
}

function activateEnemyAbilities(
  state: CombatState,
  activations: CombatActivation[],
  damages: CombatDamage[],
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
    resolveEnemyEffects(state, ability, damages)
  }
}

export function stepCombat(state: CombatState): TickResult {
  if (state.result !== 'ongoing') {
    return { state, activations: [], damages: [] }
  }

  const nextState = cloneCombatState(state)
  const activations: CombatActivation[] = []
  const damages: CombatDamage[] = []

  // §3.1: advance the integer tick first; derive time to avoid accumulated drift.
  nextState.tick += 1
  nextState.time = normalizeNumber(nextState.tick * TICK_SECONDS)

  // §3.2 status damage is introduced in T05.
  // §3.3 sudden death is introduced with enemy traits in T09.

  // §3.4 player stamina recovery.
  nextState.player.stamina = normalizeNumber(
    Math.min(
      nextState.player.staminaCap,
      nextState.player.stamina + nextState.player.staminaRegenPerSecond * TICK_SECONDS,
    ),
  )

  // §3.5 all cooldowns advance before either activation phase.
  for (const item of nextState.player.items) {
    item.cooldown = decrementCooldown(item.cooldown)
  }
  for (const ability of nextState.enemy.abilities) {
    ability.cooldown = decrementCooldown(ability.cooldown)
  }

  // §3.6-7: player grid order, then enemy ability array order.
  activatePlayerItems(nextState, activations, damages)
  activateEnemyAbilities(nextState, activations, damages)

  return { state: nextState, activations, damages }
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
