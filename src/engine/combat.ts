import { enemies, gameConfig, items } from '../data'
import type { ActiveEffect, EnemyAbility, EnemyEffect, Item } from '../data/schema'

export const TICK_SECONDS = 0.1
const EPSILON = 1e-9
const PRECISION_DIGITS = 10

export type CombatResult = 'ongoing' | 'playerVictory' | 'playerDefeat'
export type CombatSide = 'player' | 'enemy'

export interface GridPosition {
  row: number
  column: number
}

export interface BuildItemInput {
  instanceId: string
  itemId: string
  position: GridPosition
  sealed?: boolean
  initialCooldown?: number
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
  player?: PlayerSetupOverrides
  enemy?: EnemySetupOverrides
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
  player: PlayerCombatState
  enemy: EnemyCombatState
}

export interface CombatActivation {
  side: CombatSide
  sourceId: string
}

export interface TickResult {
  state: CombatState
  activations: CombatActivation[]
}

const itemById = new Map<string, Item>(items.map((item) => [item.id, item]))
const enemyById = new Map(enemies.map((enemy) => [enemy.id, enemy]))

function normalizeNumber(value: number): number {
  const rounded = Number(value.toFixed(PRECISION_DIGITS))
  return Math.abs(rounded) < EPSILON ? 0 : rounded
}

function requireFiniteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite non-negative number`)
  }

  return normalizeNumber(value)
}

function requireGridCoordinate(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer`)
  }

  return value
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
  }
}

export function createCombatState(setup: CombatSetup): CombatState {
  const instanceIds = new Set<string>()
  const playerItems = setup.build.map((input) => {
    if (instanceIds.has(input.instanceId)) {
      throw new Error(`Duplicate item instance id: ${input.instanceId}`)
    }

    instanceIds.add(input.instanceId)
    return createPlayerItemState(input)
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
    setup.enemy?.hp ?? initialEnemy.hp,
    'enemy.hp',
  )
  const enemyBlockCap = requireFiniteNonNegative(
    setup.enemy?.blockCap ?? Number.MAX_SAFE_INTEGER,
    'enemy.blockCap',
  )

  return {
    tick: 0,
    time: 0,
    result: 'ongoing',
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
      items: playerItems,
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
}

function cloneCombatState(state: CombatState): CombatState {
  return {
    ...state,
    player: {
      ...state.player,
      items: state.player.items.map((item) => ({
        ...item,
        position: { ...item.position },
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

function applyDamage(target: { hp: number; block: number }, amount: number): void {
  if (amount <= 0) {
    return
  }

  const blocked = Math.min(target.block, amount)
  target.block = normalizeNumber(target.block - blocked)
  target.hp = normalizeNumber(target.hp - (amount - blocked))
}

function updateResultAfterDamage(state: CombatState): void {
  if (state.enemy.hp <= 0) {
    state.result = 'playerVictory'
  } else if (state.player.hp <= 0) {
    state.result = 'playerDefeat'
  }
}

function resolvePlayerEffects(state: CombatState, effects: readonly ActiveEffect[]): void {
  for (const effect of effects) {
    if (effect.type === 'damage' && effect.value !== undefined) {
      applyDamage(state.enemy, effect.value)
      updateResultAfterDamage(state)
    } else if (effect.type === 'block' && effect.value !== undefined) {
      applyBlock(state.player, effect.value)
    }

    if (state.result !== 'ongoing') {
      return
    }
  }
}

function resolveEnemyEffects(state: CombatState, effects: readonly EnemyEffect[]): void {
  for (const effect of effects) {
    if (effect.type === 'damage') {
      applyDamage(state.player, effect.value)
      updateResultAfterDamage(state)
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

function activatePlayerItems(state: CombatState, activations: CombatActivation[]): void {
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
    item.cooldown = Math.max(item.baseCooldown, gameConfig.player.minimumCooldownSeconds)
    activations.push({ side: 'player', sourceId: item.instanceId })
    resolvePlayerEffects(state, item.effects)
  }
}

function activateEnemyAbilities(state: CombatState, activations: CombatActivation[]): void {
  for (const ability of state.enemy.abilities) {
    if (state.result !== 'ongoing') {
      return
    }

    if (ability.cooldown > EPSILON) {
      continue
    }

    ability.cooldown = Math.max(
      ability.baseCooldown,
      gameConfig.player.minimumCooldownSeconds,
    )
    activations.push({
      side: 'enemy',
      sourceId: `${state.enemy.id}:ability:${ability.index}`,
    })
    resolveEnemyEffects(state, ability.effects)
  }
}

export function stepCombat(state: CombatState): TickResult {
  if (state.result !== 'ongoing') {
    return { state, activations: [] }
  }

  const nextState = cloneCombatState(state)
  const activations: CombatActivation[] = []

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
  activatePlayerItems(nextState, activations)
  activateEnemyAbilities(nextState, activations)

  return { state: nextState, activations }
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
