import { affixPool, type Passive } from '../data'
import type {
  CombatState,
  CombatTriggerEffect,
  ResolvedItemModifiersInput,
} from './combat'
import { battleResolutionFromCombatState, type BattleResolution } from '../store/run'

export interface ResolvedAffixEffects {
  resolvedModifiers?: ResolvedItemModifiersInput
  resolvedTriggers?: CombatTriggerEffect[]
}

function addModifier(
  modifiers: ResolvedItemModifiersInput,
  key: keyof ResolvedItemModifiersInput,
  value: number,
): void {
  if (key === 'critMultiplier' || key === 'specialMultiplier') {
    modifiers[key] = value
    return
  }
  modifiers[key] = (modifiers[key] ?? 0) + value
}

function applyPassive(
  passive: Passive,
  modifiers: ResolvedItemModifiersInput,
  triggers: CombatTriggerEffect[],
): void {
  if (passive.type === 'critChance') {
    addModifier(modifiers, 'critChancePercent', passive.value)
  } else if (passive.type === 'flatDamage') {
    addModifier(modifiers, 'flatDamage', passive.value)
  } else if (passive.type === 'staminaMult') {
    addModifier(modifiers, 'staminaMultiplier', passive.value)
  } else if (passive.type === 'cdMult') {
    addModifier(modifiers, 'cooldownMultiplier', passive.value)
  } else if (passive.type === 'blockFlat') {
    addModifier(modifiers, 'blockFlat', passive.value)
  } else if (passive.type === 'damageMult') {
    addModifier(modifiers, 'damageMultiplier', passive.value)
  } else if (passive.type === 'critMultiplier') {
    addModifier(modifiers, 'critMultiplier', passive.value)
  } else if (passive.type === 'maxHp') {
    triggers.push({ trigger: 'battleStart', type: 'maxHp', value: passive.value })
  } else {
    throw new Error(`Affix passive type ${passive.type} is not supported as an item affix`)
  }
}

export function resolveAffixEffects(affixIds: readonly string[]): ResolvedAffixEffects {
  const affixById = new Map(affixPool.map((affix) => [affix.id, affix]))
  const modifiers: ResolvedItemModifiersInput = {}
  const triggers: CombatTriggerEffect[] = []

  for (const affixId of affixIds) {
    const affix = affixById.get(affixId)
    if (affix === undefined) throw new Error(`Unknown affix id: ${affixId}`)
    if (affix.passive !== undefined) applyPassive(affix.passive, modifiers, triggers)
    if (affix.trigger !== undefined) triggers.push({ ...affix.trigger })
  }

  return {
    ...(Object.keys(modifiers).length === 0 ? {} : { resolvedModifiers: modifiers }),
    ...(triggers.length === 0 ? {} : { resolvedTriggers: triggers }),
  }
}

function getTemporaryBattleStartMaxHp(state: CombatState): number {
  return state.player.items
    .filter((item) => !item.sealed)
    .flatMap((item) => item.triggers)
    .filter((trigger) => trigger.trigger === 'battleStart' && trigger.type === 'maxHp')
    .reduce((total, trigger) => total + trigger.value, 0)
}

/**
 * Max-HP affixes are projected into battleStart triggers so they can use the
 * existing engine without mutating run state during loadout editing. Remove
 * that temporary equipment contribution before handing the result back to the
 * run store, preventing it from accumulating again next battle.
 */
export function battleResolutionFromAffixedCombatState(state: CombatState): BattleResolution {
  const resolution = battleResolutionFromCombatState(state)
  const temporaryMaxHp = getTemporaryBattleStartMaxHp(state)
  if (temporaryMaxHp === 0) return resolution

  const playerMaxHp = Math.max(0, resolution.playerMaxHp - temporaryMaxHp)
  return {
    ...resolution,
    playerMaxHp,
    playerHp: Math.min(resolution.playerHp, playerMaxHp),
  }
}
