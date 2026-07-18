import { readFileSync } from 'node:fs'

import { enemies, items } from '../data'
import { simulate, type BuildItemInput } from '../engine/combat'
import { diagnosticBuilds, getStandardBuildForArea } from './builds'

declare const process: { argv: string[] }

interface Scenario {
  name: string
  enemyId: string
  buildId: string
  runs: number
  mutations?: Record<string, number>
  itemMutations?: Record<string, Record<string, number>>
}

interface Metrics {
  wins: number
  winRate: number
  averageDuration: number
  averageDamage: number
  fleeRate: number
}

const builds: Record<string, readonly BuildItemInput[]> = {
  standard1: getStandardBuildForArea(1).items,
  standard2: getStandardBuildForArea(2).items,
  standard3: getStandardBuildForArea(3).items,
  forestDefense: diagnosticBuilds.forestDefense.items,
  ruinsPierce: diagnosticBuilds.ruinsPierce.items,
  castleBurn: diagnosticBuilds.castleBurn.items,
  banditRush: diagnosticBuilds.banditRush.items,
  demonLegendary: diagnosticBuilds.demonKingLegendary.items,
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function setPath(target: Record<string, unknown>, path: string, value: number): void {
  const segments = path.split('.')
  let cursor: unknown = target
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]!
    if (typeof cursor !== 'object' || cursor === null) throw new Error(`Invalid mutation path ${path}`)
    cursor = (cursor as Record<string, unknown>)[segment]
  }
  if (typeof cursor !== 'object' || cursor === null) throw new Error(`Invalid mutation path ${path}`)
  ;(cursor as Record<string, unknown>)[segments.at(-1)!] = value
}

function runScenario(scenario: Scenario): Metrics {
  const enemy = enemies.find((candidate) => candidate.id === scenario.enemyId)
  if (enemy === undefined) throw new Error(`Unknown enemy ${scenario.enemyId}`)
  const build = builds[scenario.buildId]
  if (build === undefined) throw new Error(`Unknown build ${scenario.buildId}`)
  if (!Number.isInteger(scenario.runs) || scenario.runs <= 0) throw new Error('runs must be positive')
  const target = enemy as unknown as Record<string, unknown>
  for (const [path, value] of Object.entries(scenario.mutations ?? {})) setPath(target, path, value)
  for (const [itemId, mutations] of Object.entries(scenario.itemMutations ?? {})) {
    const item = items.find((candidate) => candidate.id === itemId)
    if (item === undefined) throw new Error(`Unknown item ${itemId}`)
    for (const [path, value] of Object.entries(mutations)) {
      setPath(item as unknown as Record<string, unknown>, path, value)
    }
  }

  let wins = 0
  let duration = 0
  let damage = 0
  let flees = 0
  for (let index = 0; index < scenario.runs; index += 1) {
    const result = simulate(build, scenario.enemyId, `probe:${scenario.name}:${index}`)
    if (result.result === 'playerVictory') wins += 1
    if (result.events.some((event) => event.type === 'flee')) flees += 1
    duration += result.stats.durationSeconds
    damage += result.stats.enemyDamageDealt
  }
  return {
    wins,
    winRate: round((wins / scenario.runs) * 100),
    averageDuration: round(duration / scenario.runs),
    averageDamage: round(damage / scenario.runs),
    fleeRate: round((flees / scenario.runs) * 100),
  }
}

const inputPath = process.argv[2]
if (inputPath === undefined) throw new Error('Usage: node probe.mjs scenarios.json')
const scenarios = JSON.parse(readFileSync(inputPath, 'utf8')) as Scenario[]
const originalEnemyById = new Map(enemies.map((enemy) => [enemy.id, JSON.parse(JSON.stringify(enemy))]))
const originalItemById = new Map(items.map((item) => [item.id, JSON.parse(JSON.stringify(item))]))
const output = scenarios.map((scenario) => {
  for (const enemy of enemies) {
    const original = originalEnemyById.get(enemy.id) as Record<string, unknown>
    const target = enemy as unknown as Record<string, unknown>
    for (const key of Object.keys(target)) delete target[key]
    Object.assign(target, JSON.parse(JSON.stringify(original)))
  }
  for (const item of items) {
    const original = originalItemById.get(item.id) as Record<string, unknown>
    const target = item as unknown as Record<string, unknown>
    for (const key of Object.keys(target)) delete target[key]
    Object.assign(target, JSON.parse(JSON.stringify(original)))
  }
  return { ...scenario, metrics: runScenario(scenario) }
})
console.log(JSON.stringify(output))
