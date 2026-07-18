import { enemies } from '../data'
import { simulate, type BuildItemInput } from '../engine/combat'
import { diagnosticBuilds, getStandardBuildForArea } from './builds'

const RUNS = 100

interface Metrics {
  win: number
  time: number
  damage: number
  flee: number
}

function round(value: number, digits = 2): number {
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
    win: round((wins / RUNS) * 100, 1),
    time: round(duration / RUNS),
    damage: round(damage / RUNS),
    flee: round((flees / RUNS) * 100, 1),
  }
}

function mutate(id: string, run: (enemy: Record<string, unknown>) => void): void {
  const enemy = enemies.find((candidate) => candidate.id === id) as unknown as Record<string, unknown> | undefined
  if (enemy === undefined) throw new Error(`Unknown enemy ${id}`)
  const base = JSON.parse(JSON.stringify(enemy)) as Record<string, unknown>
  try {
    run(enemy)
  } finally {
    for (const key of Object.keys(enemy)) delete enemy[key]
    Object.assign(enemy, base)
  }
}

console.log(`T23 boundary search, ${RUNS} runs per matchup`)

console.log('\nBANDIT')
mutate('EN_A1_03', (enemy) => {
  const ability = (enemy.abilities as Array<Record<string, unknown>>)[0]!
  const trait = (enemy.traits as Array<Record<string, number>>)[0]!
  for (const hp of [45, 50, 55, 60, 65, 70]) {
    for (const cooldown of [1.3, 1.35, 1.4, 1.45, 1.5, 1.55, 1.6]) {
      for (const hits of [5, 6]) {
        enemy.hp = hp
        ability.cooldown = cooldown
        trait.value = hits
        const standard = batch(getStandardBuildForArea(1).items, 'EN_A1_03', `bandit2:${hp}:${cooldown}:${hits}:standard`)
        const rush = batch(diagnosticBuilds.banditRush.items, 'EN_A1_03', `bandit2:${hp}:${cooldown}:${hits}:rush`)
        if (standard.flee >= 10 && standard.flee <= 20 && rush.flee === 0) {
          console.log(JSON.stringify({ hp, cooldown, hits, standard, rush }))
        }
      }
    }
  }
})

console.log('\nGARGOYLE')
mutate('EN_A2_04', (enemy) => {
  const ability = (enemy.abilities as Array<{ cooldown: number; effects: Array<Record<string, number>> }>)[0]!
  const trait = (enemy.traits as Array<Record<string, number>>)[0]!
  for (const hp of [130, 145, 160]) {
    for (const attack of [8, 9, 10, 11, 12]) {
      for (const cooldown of [1.6, 1.8, 2, 2.2, 2.4]) {
        for (const regen of [4, 6]) {
          enemy.hp = hp
          ability.cooldown = cooldown
          ability.effects[0]!.value = attack
          trait.value = regen
          trait.cap = regen === 6 ? 30 : 20
          const standard = batch(getStandardBuildForArea(2).items, 'EN_A2_04', `gargoyle2:${hp}:${attack}:${cooldown}:${regen}:standard`)
          const counter = batch(diagnosticBuilds.ruinsPierce.items, 'EN_A2_04', `gargoyle2:${hp}:${attack}:${cooldown}:${regen}:counter`)
          if (
            standard.time >= 6 && standard.time <= 13 &&
            standard.damage >= 5 && standard.damage <= 15 &&
            counter.damage <= standard.damage * 0.5
          ) {
            console.log(JSON.stringify({ hp, attack, cooldown, regen, standard, counter }))
          }
        }
      }
    }
  }
})

console.log('\nVAMPIRE')
mutate('EN_A3_02', (enemy) => {
  const ability = (enemy.abilities as Array<{ cooldown: number; effects: Array<Record<string, number>> }>)[0]!
  const trait = (enemy.traits as Array<Record<string, number>>)[0]!
  for (const hp of [220, 250, 280, 310]) {
    for (const attack of [4, 5, 6]) {
      for (const cooldown of [1, 1.2, 1.4, 1.6]) {
        for (const lifesteal of [3, 5, 7, 9]) {
          enemy.hp = hp
          ability.cooldown = cooldown
          ability.effects[0]!.value = attack
          trait.value = lifesteal
          const standard = batch(getStandardBuildForArea(3).items, 'EN_A3_02', `vampire2:${hp}:${attack}:${cooldown}:${lifesteal}:standard`)
          const counter = batch(diagnosticBuilds.castleBurn.items, 'EN_A3_02', `vampire2:${hp}:${attack}:${cooldown}:${lifesteal}:counter`)
          if (
            standard.time >= 6 && standard.time <= 13 &&
            standard.damage >= 5 && standard.damage <= 15 &&
            counter.damage <= standard.damage * 0.5
          ) {
            console.log(JSON.stringify({ hp, attack, cooldown, lifesteal, standard, counter }))
          }
        }
      }
    }
  }
})
