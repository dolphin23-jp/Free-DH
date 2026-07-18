import { enemies } from '../data'
import { prepareAbyssEnemyDefinition } from '../engine/abyss'
import { simulate, type BuildItemInput } from '../engine/combat'
import { getStandardBuildForArea, type SimulatorArea } from './builds'

const RUNS = 1000
const LEVELS = [5, 10] as const
const TRAIT_HEAVY_ENEMY_IDS = new Set([
  'EN_A1_02',
  'EN_A2_04',
  'EN_A2_05',
  'EN_A3_01',
  'EN_A3_02',
])

interface Metrics {
  winRate: number
  averageDuration: number
  averageDamage: number
}

interface Row extends Metrics {
  level: number
  elite: boolean
  enemyId: string
  enemyName: string
  boss: boolean
  group: 'direct' | 'trait-heavy'
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function simulateBatch(
  build: readonly BuildItemInput[],
  enemyId: string,
  level: number,
  elite: boolean,
): Metrics {
  prepareAbyssEnemyDefinition(enemyId, level, elite)
  let wins = 0
  let duration = 0
  let damage = 0
  for (let index = 0; index < RUNS; index += 1) {
    const result = simulate(build, enemyId, `t23-final:${level}:${elite ? 'elite' : 'normal'}:${enemyId}:${index}`)
    if (result.result === 'playerVictory') wins += 1
    duration += result.stats.durationSeconds
    damage += result.stats.enemyDamageDealt
  }
  return {
    winRate: round((wins / RUNS) * 100),
    averageDuration: round(duration / RUNS),
    averageDamage: round(damage / RUNS),
  }
}

function mean(rows: readonly Row[], key: keyof Metrics): number {
  return round(rows.reduce((sum, row) => sum + row[key], 0) / rows.length)
}

const rows: Row[] = []
for (const level of LEVELS) {
  for (const enemy of enemies) {
    const area = enemy.area as SimulatorArea
    const group = TRAIT_HEAVY_ENEMY_IDS.has(enemy.id) ? 'trait-heavy' : 'direct'
    const base = { level, enemyId: enemy.id, enemyName: enemy.name, boss: enemy.isBoss, group } as const
    rows.push({
      ...base,
      elite: false,
      ...simulateBatch(getStandardBuildForArea(area).items, enemy.id, level, false),
    })
    if (!enemy.isBoss) {
      rows.push({
        ...base,
        elite: true,
        ...simulateBatch(getStandardBuildForArea(area).items, enemy.id, level, true),
      })
    }
  }
}

console.log(`T23 final abyss diagnostic, ${RUNS} runs per matchup`)
console.log('level\telite\tgroup\tenemy\twin%\ttime\tdamage')
for (const row of rows) {
  console.log(`${row.level}\t${row.elite ? 'yes' : 'no'}\t${row.group}\t${row.enemyId} ${row.enemyName}\t${row.winRate}\t${row.averageDuration}\t${row.averageDamage}`)
}
console.log('\nGROUP SUMMARY')
for (const level of LEVELS) {
  for (const elite of [false, true]) {
    for (const group of ['direct', 'trait-heavy'] as const) {
      const selected = rows.filter(
        (row) => row.level === level && row.elite === elite && row.group === group && (!elite || !row.boss),
      )
      console.log(
        `Lv${level} ${elite ? 'elite' : 'normal'} ${group}: ` +
          `win=${mean(selected, 'winRate')}% time=${mean(selected, 'averageDuration')} damage=${mean(selected, 'averageDamage')}`,
      )
    }
  }
}
