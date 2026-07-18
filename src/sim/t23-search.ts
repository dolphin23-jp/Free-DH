import { enemies } from '../data'
import { simulate, type BuildItemInput } from '../engine/combat'
import { diagnosticBuilds, getStandardBuildForArea } from './builds'

const RUNS = 300

interface Metrics {
  win: number
  time: number
  damage: number
  flee: number
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function batch(build: readonly BuildItemInput[], enemyId: string, seed: string): Metrics {
  let wins = 0
  let duration = 0
  let damage = 0
  let flees = 0
  for (let index = 0; index < RUNS; index += 1) {
    const result = simulate(build, enemyId, `${seed}:${index}`)
    if (result.result === 'playerVictory') wins += 1
    if (result.events.some((event) => event.type === 'flee')) flees += 1
    duration += result.stats.durationSeconds
    damage += result.stats.enemyDamageDealt
  }
  return {
    win: round((wins / RUNS) * 100),
    time: round(duration / RUNS, 2),
    damage: round(damage / RUNS, 2),
    flee: round((flees / RUNS) * 100),
  }
}

function mutableEnemy(id: string): Record<string, unknown> {
  const enemy = enemies.find((candidate) => candidate.id === id)
  if (enemy === undefined) throw new Error(`Unknown enemy ${id}`)
  return enemy as unknown as Record<string, unknown>
}

function withRestoredEnemy(id: string, run: (enemy: Record<string, unknown>) => void): void {
  const enemy = mutableEnemy(id)
  const base = JSON.parse(JSON.stringify(enemy)) as Record<string, unknown>
  try {
    run(enemy)
  } finally {
    for (const key of Object.keys(enemy)) delete enemy[key]
    Object.assign(enemy, base)
  }
}

console.log(`T23 parameter search, ${RUNS} runs per matchup`)

console.log('\nBANDIT')
withRestoredEnemy('EN_A1_03', (enemy) => {
  const traits = enemy.traits as Array<Record<string, number>>
  for (const hp of [45, 48, 50, 52, 55, 58, 60]) {
    for (const hits of [5, 6]) {
      enemy.hp = hp
      traits[0]!.value = hits
      const standard = batch(getStandardBuildForArea(1).items, 'EN_A1_03', `bandit:${hp}:${hits}:standard`)
      const rush = batch(diagnosticBuilds.banditRush.items, 'EN_A1_03', `bandit:${hp}:${hits}:rush`)
      if (standard.flee >= 5 && standard.flee <= 30 && rush.flee === 0) {
        console.log(JSON.stringify({ hp, hits, standard, rush }))
      }
    }
  }
})

console.log('\nGARGOYLE')
withRestoredEnemy('EN_A2_04', (enemy) => {
  const ability = (enemy.abilities as Array<{ effects: Array<Record<string, number>> }>)[0]!
  const trait = (enemy.traits as Array<Record<string, number>>)[0]!
  for (const hp of [135, 140, 145, 150, 155]) {
    for (const attack of [11, 12, 13, 14]) {
      for (const regen of [4, 5, 6]) {
        enemy.hp = hp
        ability.effects[0]!.value = attack
        trait.value = regen
        trait.cap = regen >= 6 ? 30 : 20
        const standard = batch(getStandardBuildForArea(2).items, 'EN_A2_04', `gargoyle:${hp}:${attack}:${regen}:standard`)
        const counter = batch(diagnosticBuilds.ruinsPierce.items, 'EN_A2_04', `gargoyle:${hp}:${attack}:${regen}:counter`)
        if (
          standard.time >= 6 && standard.time <= 13 &&
          standard.damage >= 5 && standard.damage <= 15 &&
          counter.damage <= standard.damage * 0.5
        ) {
          console.log(JSON.stringify({ hp, attack, regen, standard, counter }))
        }
      }
    }
  }
})

console.log('\nVAMPIRE')
withRestoredEnemy('EN_A3_02', (enemy) => {
  const ability = (enemy.abilities as Array<{ effects: Array<Record<string, number>> }>)[0]!
  const trait = (enemy.traits as Array<Record<string, number>>)[0]!
  for (const hp of [220, 240, 250, 260, 280, 300]) {
    for (const attack of [6, 7, 8]) {
      for (const lifesteal of [2, 3, 4, 5, 6]) {
        enemy.hp = hp
        ability.effects[0]!.value = attack
        trait.value = lifesteal
        const standard = batch(getStandardBuildForArea(3).items, 'EN_A3_02', `vampire:${hp}:${attack}:${lifesteal}:standard`)
        const counter = batch(diagnosticBuilds.castleBurn.items, 'EN_A3_02', `vampire:${hp}:${attack}:${lifesteal}:counter`)
        if (
          standard.time >= 6 && standard.time <= 13 &&
          standard.damage >= 5 && standard.damage <= 15 &&
          counter.damage <= standard.damage * 0.5
        ) {
          console.log(JSON.stringify({ hp, attack, lifesteal, standard, counter }))
        }
      }
    }
  }
})

console.log('\nDEMON KING')
withRestoredEnemy('EN_A3_05', (enemy) => {
  const phases = enemy.phases as Array<{
    abilities: Array<{ effects: Array<Record<string, number>> }>
    traits: Array<Record<string, number>>
  }>
  for (const phase1 of [12, 14, 16, 18, 20]) {
    for (const phase2 of [18, 20, 22, 24, 26, 28]) {
      for (const enrage of [2, 3, 4]) {
        phases[0]!.abilities[0]!.effects[0]!.value = phase1
        phases[1]!.abilities[0]!.effects[0]!.value = phase2
        phases[1]!.traits[0]!.value = enrage
        const standard = batch(getStandardBuildForArea(3).items, 'EN_A3_05', `demon:${phase1}:${phase2}:${enrage}:standard`)
        const legendary = batch(diagnosticBuilds.demonKingLegendary.items, 'EN_A3_05', `demon:${phase1}:${phase2}:${enrage}:legendary`)
        if (standard.win >= 50 && standard.win <= 70 && legendary.win > 85 && standard.time >= 12 && standard.time <= 22) {
          console.log(JSON.stringify({ phase1, phase2, enrage, standard, legendary }))
        }
      }
    }
  }
})
