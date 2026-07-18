import { createStore, type StoreApi } from 'zustand/vanilla'

import { enemies, gameConfig, items } from '../data'
import type {
  BuildItemInput,
  CombatSetup,
  CombatState,
  CombatTriggerEffect,
  GridPosition,
  ResolvedItemModifiersInput,
} from '../engine/combat'
import { fork, nextMulberry32, normalizeSeed, type Seed } from '../engine/rng'

export const RUN_SNAPSHOT_VERSION = 1
export const RUN_BATTLE_COUNT = 15

const RUN_AREAS = [1, 2, 3] as const
const REGULAR_BATTLES_PER_AREA = 4
const itemIds = new Set(items.map((item) => item.id))

export type RunPhase = 'idle' | 'preBattle' | 'battle' | 'result'
export type RunOutcome = 'cleared' | 'defeated'

export interface RunInventoryItem {
  instanceId: string
  itemId: string
  affixIds: string[]
  rotated: boolean
  runDamageBonus: number
  resolvedModifiers?: ResolvedItemModifiersInput
  resolvedTriggers?: CombatTriggerEffect[]
}

export interface RunBagItem extends RunInventoryItem {
  position: GridPosition
}

export interface RunBagState {
  columns: number
  rows: number
  items: RunBagItem[]
}

export interface RunStorageState {
  capacity: number
  items: RunInventoryItem[]
}

export interface RunInventorySnapshot {
  bag: RunBagState
  storage: RunStorageState
}

export interface RunResult {
  outcome: RunOutcome
  battlesWon: number
  reachedBattleIndex: number
  finalHp: number
  finalMaxHp: number
  finalGold: number
}

export interface RunData {
  phase: RunPhase
  runSeed: Seed | null
  battleIndex: number
  battlesWon: number
  currentHp: number
  maxHp: number
  gold: number
  enemyOrder: string[]
  bag: RunBagState
  storage: RunStorageState
  result: RunResult | null
}

export interface RunSnapshot extends RunData {
  version: typeof RUN_SNAPSHOT_VERSION
}

export interface BattleResolution {
  result: 'playerVictory' | 'playerDefeat'
  playerHp: number
  playerMaxHp: number
  playerGold: number
  runDamageBonusByInstanceId?: Readonly<Record<string, number>>
}

export interface RunActions {
  startRun: (seed: Seed, initialInventory?: RunInventorySnapshot) => void
  beginBattle: () => void
  completeBattle: (resolution: BattleResolution) => void
  replaceInventory: (inventory: RunInventorySnapshot) => void
  loadSnapshot: (snapshot: RunSnapshot) => void
  resetRun: () => void
}

export type RunStoreState = RunData & RunActions

function requireFiniteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite non-negative number`)
  }
  return value
}

function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer`)
  }
  return value
}

function requireNonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer`)
  }
  return value
}

function cloneModifiers(
  modifiers: ResolvedItemModifiersInput | undefined,
): ResolvedItemModifiersInput | undefined {
  return modifiers === undefined ? undefined : { ...modifiers }
}

function cloneTriggers(
  triggers: CombatTriggerEffect[] | undefined,
): CombatTriggerEffect[] | undefined {
  return triggers?.map((trigger) => ({ ...trigger }))
}

function cloneInventoryItem(item: RunInventoryItem): RunInventoryItem {
  const cloned: RunInventoryItem = {
    instanceId: item.instanceId,
    itemId: item.itemId,
    affixIds: [...item.affixIds],
    rotated: item.rotated,
    runDamageBonus: item.runDamageBonus,
  }
  const resolvedModifiers = cloneModifiers(item.resolvedModifiers)
  const resolvedTriggers = cloneTriggers(item.resolvedTriggers)
  if (resolvedModifiers !== undefined) cloned.resolvedModifiers = resolvedModifiers
  if (resolvedTriggers !== undefined) cloned.resolvedTriggers = resolvedTriggers
  return cloned
}

function cloneBagItem(item: RunBagItem): RunBagItem {
  return { ...cloneInventoryItem(item), position: { ...item.position } }
}

function cloneInventory(inventory: RunInventorySnapshot): RunInventorySnapshot {
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

function cloneRunData(data: RunData): RunData {
  const inventory = cloneInventory({ bag: data.bag, storage: data.storage })
  return {
    phase: data.phase,
    runSeed: data.runSeed,
    battleIndex: data.battleIndex,
    battlesWon: data.battlesWon,
    currentHp: data.currentHp,
    maxHp: data.maxHp,
    gold: data.gold,
    enemyOrder: [...data.enemyOrder],
    bag: inventory.bag,
    storage: inventory.storage,
    result: data.result === null ? null : { ...data.result },
  }
}

function createInitialInventory(): RunInventorySnapshot {
  return {
    bag: {
      columns: gameConfig.player.initialBag.columns,
      rows: gameConfig.player.initialBag.rows,
      items: [],
    },
    storage: {
      capacity: gameConfig.player.storageSlots,
      items: [],
    },
  }
}

function createIdleData(): RunData {
  const inventory = createInitialInventory()
  return {
    phase: 'idle',
    runSeed: null,
    battleIndex: 0,
    battlesWon: 0,
    currentHp: gameConfig.player.initialHp,
    maxHp: gameConfig.player.initialHp,
    gold: gameConfig.player.initialGold,
    enemyOrder: [],
    bag: inventory.bag,
    storage: inventory.storage,
    result: null,
  }
}

function shuffleAreaEnemies(seed: Seed, area: (typeof RUN_AREAS)[number]): string[] {
  const regularIds = enemies
    .filter((enemy) => enemy.area === area && !enemy.isBoss)
    .map((enemy) => enemy.id)
  const bossIds = enemies
    .filter((enemy) => enemy.area === area && enemy.isBoss)
    .map((enemy) => enemy.id)

  if (regularIds.length !== REGULAR_BATTLES_PER_AREA || bossIds.length !== 1) {
    throw new Error(
      `Area ${area} must define ${REGULAR_BATTLES_PER_AREA} regular enemies and one boss`,
    )
  }

  const shuffled = [...regularIds]
  let rngState = fork(seed, `enemyOrder:${area}`)
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const step = nextMulberry32(rngState)
    rngState = step.state
    const target = Math.floor(step.value * (index + 1))
    const current = shuffled[index]!
    shuffled[index] = shuffled[target]!
    shuffled[target] = current
  }

  return [...shuffled, bossIds[0]!]
}

export function createEnemyOrder(seed: Seed): string[] {
  normalizeSeed(seed)
  return RUN_AREAS.flatMap((area) => shuffleAreaEnemies(seed, area))
}

function validateInventoryItem(item: RunInventoryItem, label: string): void {
  if (item.instanceId.trim().length === 0) {
    throw new Error(`${label}.instanceId must not be empty`)
  }
  if (!itemIds.has(item.itemId)) {
    throw new Error(`${label}.itemId is unknown: ${item.itemId}`)
  }
  requireFiniteNonNegative(item.runDamageBonus, `${label}.runDamageBonus`)
}

function validateInventory(inventory: RunInventorySnapshot): RunInventorySnapshot {
  requirePositiveInteger(inventory.bag.columns, 'bag.columns')
  requirePositiveInteger(inventory.bag.rows, 'bag.rows')
  requirePositiveInteger(inventory.storage.capacity, 'storage.capacity')
  if (inventory.storage.items.length > inventory.storage.capacity) {
    throw new RangeError('storage.items exceeds storage.capacity')
  }

  const instanceIds = new Set<string>()
  inventory.bag.items.forEach((item, index) => {
    validateInventoryItem(item, `bag.items[${index}]`)
    requireNonNegativeInteger(item.position.row, `bag.items[${index}].position.row`)
    requireNonNegativeInteger(item.position.column, `bag.items[${index}].position.column`)
    if (instanceIds.has(item.instanceId)) {
      throw new Error(`Duplicate inventory instance id: ${item.instanceId}`)
    }
    instanceIds.add(item.instanceId)
  })
  inventory.storage.items.forEach((item, index) => {
    validateInventoryItem(item, `storage.items[${index}]`)
    if (instanceIds.has(item.instanceId)) {
      throw new Error(`Duplicate inventory instance id: ${item.instanceId}`)
    }
    instanceIds.add(item.instanceId)
  })

  return cloneInventory(inventory)
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function dataFromSnapshot(snapshot: RunSnapshot): RunData {
  if (snapshot.version !== RUN_SNAPSHOT_VERSION) {
    throw new Error(`Unsupported run snapshot version: ${snapshot.version}`)
  }

  requireNonNegativeInteger(snapshot.battleIndex, 'battleIndex')
  requireNonNegativeInteger(snapshot.battlesWon, 'battlesWon')
  const currentHp = requireFiniteNonNegative(snapshot.currentHp, 'currentHp')
  const maxHp = requireFiniteNonNegative(snapshot.maxHp, 'maxHp')
  requireFiniteNonNegative(snapshot.gold, 'gold')
  if (currentHp > maxHp) {
    throw new RangeError('currentHp must not exceed maxHp')
  }

  const inventory = validateInventory({ bag: snapshot.bag, storage: snapshot.storage })
  if (snapshot.phase === 'idle') {
    if (
      snapshot.runSeed !== null ||
      snapshot.enemyOrder.length !== 0 ||
      snapshot.result !== null ||
      snapshot.battlesWon !== 0
    ) {
      throw new Error('Idle snapshot must not contain an active run')
    }
  } else {
    if (snapshot.runSeed === null) {
      throw new Error('Active run snapshot requires runSeed')
    }
    if (!arraysEqual(snapshot.enemyOrder, createEnemyOrder(snapshot.runSeed))) {
      throw new Error('Snapshot enemyOrder does not match runSeed')
    }
    if (snapshot.battleIndex >= RUN_BATTLE_COUNT) {
      throw new RangeError(`battleIndex must be below ${RUN_BATTLE_COUNT}`)
    }
  }

  if (snapshot.phase === 'result' && snapshot.result === null) {
    throw new Error('Result phase requires result data')
  }
  if (snapshot.phase !== 'result' && snapshot.result !== null) {
    throw new Error('Only result phase may contain result data')
  }

  return {
    phase: snapshot.phase,
    runSeed: snapshot.runSeed,
    battleIndex: snapshot.battleIndex,
    battlesWon: snapshot.battlesWon,
    currentHp,
    maxHp,
    gold: snapshot.gold,
    enemyOrder: [...snapshot.enemyOrder],
    bag: inventory.bag,
    storage: inventory.storage,
    result: snapshot.result === null ? null : { ...snapshot.result },
  }
}

function requirePhase(state: RunData, expected: RunPhase, action: string): void {
  if (state.phase !== expected) {
    throw new Error(`${action} requires phase ${expected}; current phase is ${state.phase}`)
  }
}

function withRunDamageBonus(
  item: RunInventoryItem,
  bonuses: Readonly<Record<string, number>>,
): RunInventoryItem {
  const clone = cloneInventoryItem(item)
  const bonus = bonuses[item.instanceId]
  if (bonus !== undefined) {
    clone.runDamageBonus = requireFiniteNonNegative(
      bonus,
      `runDamageBonusByInstanceId.${item.instanceId}`,
    )
  }
  return clone
}

function applyRunDamageBonuses(
  inventory: RunInventorySnapshot,
  bonuses: Readonly<Record<string, number>> | undefined,
): RunInventorySnapshot {
  if (bonuses === undefined) return validateInventory(inventory)

  return validateInventory({
    bag: {
      ...inventory.bag,
      items: inventory.bag.items.map((item) => ({
        ...withRunDamageBonus(item, bonuses),
        position: { ...item.position },
      })),
    },
    storage: {
      ...inventory.storage,
      items: inventory.storage.items.map((item) => withRunDamageBonus(item, bonuses)),
    },
  })
}

function buildResult(
  state: RunData,
  outcome: RunOutcome,
  battlesWon: number,
  hp: number,
  maxHp: number,
  gold: number,
): RunResult {
  return {
    outcome,
    battlesWon,
    reachedBattleIndex: state.battleIndex,
    finalHp: hp,
    finalMaxHp: maxHp,
    finalGold: gold,
  }
}

export function battleResolutionFromCombatState(state: CombatState): BattleResolution {
  if (state.result === 'ongoing') {
    throw new Error('Cannot complete a run battle from an ongoing combat state')
  }

  const runDamageBonusByInstanceId: Record<string, number> = {}
  for (const item of state.player.items) {
    if (!item.virtual) runDamageBonusByInstanceId[item.instanceId] = item.runDamageBonus
  }

  return {
    result: state.result,
    playerHp: Math.max(0, state.player.hp),
    playerMaxHp: state.player.maxHp,
    playerGold: state.player.gold,
    runDamageBonusByInstanceId,
  }
}

export function getCurrentEnemyId(state: RunData): string | null {
  if (state.phase === 'idle' || state.phase === 'result') return null
  return state.enemyOrder[state.battleIndex] ?? null
}

export function getCurrentBattleSeed(state: RunData): number | null {
  if (state.runSeed === null || getCurrentEnemyId(state) === null) return null
  return fork(state.runSeed, `battle:${state.battleIndex}`)
}

function toCombatBuild(items: readonly RunBagItem[]): BuildItemInput[] {
  return items.map((item) => {
    const buildItem: BuildItemInput = {
      instanceId: item.instanceId,
      itemId: item.itemId,
      position: { ...item.position },
      rotated: item.rotated,
      runDamageBonus: item.runDamageBonus,
    }
    const resolvedModifiers = cloneModifiers(item.resolvedModifiers)
    const resolvedTriggers = cloneTriggers(item.resolvedTriggers)
    if (resolvedModifiers !== undefined) buildItem.resolvedModifiers = resolvedModifiers
    if (resolvedTriggers !== undefined) buildItem.resolvedTriggers = resolvedTriggers
    return buildItem
  })
}

export function selectCurrentCombatSetup(state: RunData): CombatSetup | null {
  const enemyId = getCurrentEnemyId(state)
  const seed = getCurrentBattleSeed(state)
  if (enemyId === null || seed === null) return null

  return {
    build: toCombatBuild(state.bag.items),
    enemyId,
    seed,
    player: {
      hp: state.currentHp,
      maxHp: state.maxHp,
      gold: state.gold,
    },
  }
}

export function exportRunSnapshot(state: RunData): RunSnapshot {
  return { version: RUN_SNAPSHOT_VERSION, ...cloneRunData(state) }
}

export function createRunStore(snapshot?: RunSnapshot): StoreApi<RunStoreState> {
  const initialData = snapshot === undefined ? createIdleData() : dataFromSnapshot(snapshot)

  return createStore<RunStoreState>()((set, get) => ({
    ...cloneRunData(initialData),

    startRun: (seed, initialInventory) => {
      normalizeSeed(seed)
      const inventory = validateInventory(initialInventory ?? createInitialInventory())
      set({
        phase: 'preBattle',
        runSeed: seed,
        battleIndex: 0,
        battlesWon: 0,
        currentHp: gameConfig.player.initialHp,
        maxHp: gameConfig.player.initialHp,
        gold: gameConfig.player.initialGold,
        enemyOrder: createEnemyOrder(seed),
        bag: inventory.bag,
        storage: inventory.storage,
        result: null,
      })
    },

    beginBattle: () => {
      const state = get()
      requirePhase(state, 'preBattle', 'beginBattle')
      if (getCurrentEnemyId(state) === null) {
        throw new Error('No enemy is available for the current battle')
      }
      set({ phase: 'battle' })
    },

    completeBattle: (resolution) => {
      const state = get()
      requirePhase(state, 'battle', 'completeBattle')
      const maxHp = requireFiniteNonNegative(resolution.playerMaxHp, 'resolution.playerMaxHp')
      const hp = Math.min(
        requireFiniteNonNegative(resolution.playerHp, 'resolution.playerHp'),
        maxHp,
      )
      const gold = requireFiniteNonNegative(resolution.playerGold, 'resolution.playerGold')
      const inventory = applyRunDamageBonuses(
        { bag: state.bag, storage: state.storage },
        resolution.runDamageBonusByInstanceId,
      )

      if (resolution.result === 'playerDefeat') {
        set({
          phase: 'result',
          currentHp: hp,
          maxHp,
          gold,
          bag: inventory.bag,
          storage: inventory.storage,
          result: buildResult(state, 'defeated', state.battlesWon, hp, maxHp, gold),
        })
        return
      }

      const battlesWon = state.battlesWon + 1
      if (state.battleIndex === RUN_BATTLE_COUNT - 1) {
        set({
          phase: 'result',
          battlesWon,
          currentHp: hp,
          maxHp,
          gold,
          bag: inventory.bag,
          storage: inventory.storage,
          result: buildResult(state, 'cleared', battlesWon, hp, maxHp, gold),
        })
        return
      }

      set({
        phase: 'preBattle',
        battleIndex: state.battleIndex + 1,
        battlesWon,
        currentHp: hp,
        maxHp,
        gold,
        bag: inventory.bag,
        storage: inventory.storage,
        result: null,
      })
    },

    replaceInventory: (inventory) => {
      if (get().phase === 'battle') {
        throw new Error('Inventory cannot change during battle')
      }
      const validated = validateInventory(inventory)
      set({ bag: validated.bag, storage: validated.storage })
    },

    loadSnapshot: (nextSnapshot) => set(dataFromSnapshot(nextSnapshot)),
    resetRun: () => set(createIdleData()),
  }))
}

export const runStore = createRunStore()
