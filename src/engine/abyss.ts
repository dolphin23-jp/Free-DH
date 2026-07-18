import { enemies, gameConfig } from '../data'
import { fork, nextMulberry32, type Seed } from './rng'

interface MutableEnemyEffect {
  type: string
  value: number
}

interface MutableEnemyAbility {
  effects: MutableEnemyEffect[]
}

interface MutableEnemyPhase {
  hp: number
  abilities: MutableEnemyAbility[]
}

interface MutableEnemyDefinition {
  id: string
  hp?: number
  abilities?: MutableEnemyAbility[]
  phases?: MutableEnemyPhase[]
}

const mutableEnemies = enemies as unknown as MutableEnemyDefinition[]
const baseEnemyById = new Map(
  mutableEnemies.map((enemy) => [enemy.id, JSON.parse(JSON.stringify(enemy)) as MutableEnemyDefinition]),
)

function requireAbyssLevel(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > gameConfig.abyss.maximumLevel) {
    throw new RangeError(`abyssLevel must be between 0 and ${gameConfig.abyss.maximumLevel}`)
  }
  return value
}

function normalized(value: number): number {
  return Number(value.toFixed(10))
}

function scaleAbilities(abilities: MutableEnemyAbility[], attackMultiplier: number): void {
  for (const ability of abilities) {
    for (const effect of ability.effects) {
      if (effect.type === 'damage') effect.value = normalized(effect.value * attackMultiplier)
    }
  }
}

export interface AbyssEnemyModifiers {
  hpMultiplier: number
  attackMultiplier: number
  elite: boolean
}

export function getAbyssEnemyModifiers(abyssLevel: number, elite: boolean): AbyssEnemyModifiers {
  const level = requireAbyssLevel(abyssLevel)
  return {
    hpMultiplier:
      (1 + gameConfig.abyss.enemyHpMultiplierPerLevel * level) *
      (elite ? 1 + gameConfig.abyss.eliteHpBonusMultiplier : 1),
    attackMultiplier: 1 + gameConfig.abyss.enemyAttackMultiplierPerLevel * level,
    elite,
  }
}

export function isEliteBattle(runSeed: Seed, battleIndex: number, abyssLevel: number): boolean {
  const level = requireAbyssLevel(abyssLevel)
  if (level < gameConfig.abyss.eliteStartsAtLevel) return false
  if (!Number.isInteger(battleIndex) || battleIndex < 0 || battleIndex >= 15) {
    throw new RangeError('battleIndex must be an integer between 0 and 14')
  }
  const localBattleIndex = battleIndex % 5
  if (localBattleIndex === 4) return false
  const area = Math.floor(battleIndex / 5) + 1
  const roll = nextMulberry32(fork(runSeed, `elite:${area}`)).value
  return localBattleIndex === Math.floor(roll * 4)
}

export function prepareAbyssEnemyDefinition(
  enemyId: string,
  abyssLevel: number,
  elite: boolean,
): AbyssEnemyModifiers {
  const target = mutableEnemies.find((enemy) => enemy.id === enemyId)
  const base = baseEnemyById.get(enemyId)
  if (target === undefined || base === undefined) throw new Error(`Unknown enemy id: ${enemyId}`)

  const restored = JSON.parse(JSON.stringify(base)) as MutableEnemyDefinition
  Object.keys(target).forEach((key) => delete (target as unknown as Record<string, unknown>)[key])
  Object.assign(target, restored)

  const modifiers = getAbyssEnemyModifiers(abyssLevel, elite)
  if (target.phases !== undefined) {
    for (const phase of target.phases) {
      phase.hp = normalized(phase.hp * modifiers.hpMultiplier)
      scaleAbilities(phase.abilities, modifiers.attackMultiplier)
    }
  } else if (target.hp !== undefined && target.abilities !== undefined) {
    target.hp = normalized(target.hp * modifiers.hpMultiplier)
    scaleAbilities(target.abilities, modifiers.attackMultiplier)
  }
  return modifiers
}
