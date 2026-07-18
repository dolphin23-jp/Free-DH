import { enemies } from '../data'
import { simulate, type BuildItemInput } from '../engine/combat'
import {
  diagnosticBuilds,
  getStandardBuildForArea,
  standardBuilds,
  type SimulatorArea,
  type SimulatorBuild,
} from './builds'

export const DEFAULT_SIMULATION_RUNS = 100

export interface SimulationMetrics {
  runs: number
  wins: number
  losses: number
  flees: number
  winRatePercent: number
  fleeRatePercent: number
  averageDurationSeconds: number
  averageDamageTaken: number
}

export interface StandardMatchupReport {
  enemyId: string
  enemyName: string
  area: SimulatorArea
  isBoss: boolean
  buildId: string
  buildName: string
  metrics: SimulationMetrics
  warnings: readonly string[]
}

export interface CounterComparisonReport {
  enemyId: string
  enemyName: string
  baselineBuildId: string
  counterBuildId: string
  baselineDamageTaken: number
  counterDamageTaken: number
  damageRatio: number | null
  passed: boolean
}

export interface BalanceSuiteReport {
  runsPerMatchup: number
  standardMatchups: readonly StandardMatchupReport[]
  counterComparisons: readonly CounterComparisonReport[]
  bandit: {
    standard: SimulationMetrics
    rush: SimulationMetrics
  }
  stoneGiantNoPierce: SimulationMetrics
  demonKing: {
    standard: SimulationMetrics
    legendary: SimulationMetrics
  }
  warnings: readonly string[]
}

interface CounterScenario {
  enemyId: string
  baseline: SimulatorBuild
  counter: SimulatorBuild
}

function requireRuns(runs: number): number {
  if (!Number.isInteger(runs) || runs <= 0) {
    throw new RangeError('runs must be a positive integer')
  }

  return runs
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function average(total: number, runs: number): number {
  return round(total / runs)
}

export function simulateBatch(
  build: readonly BuildItemInput[],
  enemyId: string,
  runs: number,
  seedPrefix = 'sim',
): SimulationMetrics {
  const validRuns = requireRuns(runs)
  let wins = 0
  let losses = 0
  let flees = 0
  let durationTotal = 0
  let damageTakenTotal = 0

  for (let index = 0; index < validRuns; index += 1) {
    const result = simulate(build, enemyId, `${seedPrefix}:${enemyId}:${index}`)

    if (result.result === 'playerVictory') {
      wins += 1
    } else {
      losses += 1
    }

    if (result.events.some((event) => event.type === 'flee')) {
      flees += 1
    }

    durationTotal += result.stats.durationSeconds
    damageTakenTotal += result.stats.enemyDamageDealt
  }

  return {
    runs: validRuns,
    wins,
    losses,
    flees,
    winRatePercent: round((wins / validRuns) * 100),
    fleeRatePercent: round((flees / validRuns) * 100),
    averageDurationSeconds: average(durationTotal, validRuns),
    averageDamageTaken: average(damageTakenTotal, validRuns),
  }
}

function targetRangeWarning(
  label: string,
  value: number,
  minimum: number,
  maximum: number,
): string | null {
  if (value >= minimum && value <= maximum) {
    return null
  }

  return `${label}: ${value} is outside ${minimum}-${maximum}`
}

function standardWarnings(
  enemyName: string,
  isBoss: boolean,
  metrics: SimulationMetrics,
): string[] {
  const warnings: string[] = []
  const durationRange = isBoss ? ([12, 22] as const) : ([6, 13] as const)
  const damageRange = isBoss ? ([20, 35] as const) : ([5, 15] as const)
  const durationWarning = targetRangeWarning(
    `${enemyName} average duration`,
    metrics.averageDurationSeconds,
    durationRange[0],
    durationRange[1],
  )
  const damageWarning = targetRangeWarning(
    `${enemyName} average damage taken`,
    metrics.averageDamageTaken,
    damageRange[0],
    damageRange[1],
  )

  if (durationWarning !== null) {
    warnings.push(durationWarning)
  }
  if (damageWarning !== null) {
    warnings.push(damageWarning)
  }

  return warnings
}

function compareCounterScenario(
  scenario: CounterScenario,
  runs: number,
): CounterComparisonReport {
  const enemy = enemies.find((candidate) => candidate.id === scenario.enemyId)

  if (enemy === undefined) {
    throw new Error(`Unknown counter scenario enemy: ${scenario.enemyId}`)
  }

  const baseline = simulateBatch(
    scenario.baseline.items,
    scenario.enemyId,
    runs,
    `counter:${scenario.enemyId}:baseline`,
  )
  const counter = simulateBatch(
    scenario.counter.items,
    scenario.enemyId,
    runs,
    `counter:${scenario.enemyId}:answer`,
  )
  const damageRatio =
    baseline.averageDamageTaken === 0
      ? null
      : round(counter.averageDamageTaken / baseline.averageDamageTaken, 4)

  return {
    enemyId: enemy.id,
    enemyName: enemy.name,
    baselineBuildId: scenario.baseline.id,
    counterBuildId: scenario.counter.id,
    baselineDamageTaken: baseline.averageDamageTaken,
    counterDamageTaken: counter.averageDamageTaken,
    damageRatio,
    passed:
      damageRatio === null
        ? counter.averageDamageTaken === 0
        : damageRatio <= 0.5,
  }
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

function formatNumber(value: number): string {
  return value.toFixed(1)
}

function pushCheck(
  lines: string[],
  label: string,
  passed: boolean,
  detail: string,
): void {
  lines.push(`${passed ? '[OK]' : '[WARN]'} ${label}: ${detail}`)
}

export function runBalanceSuite(runs = DEFAULT_SIMULATION_RUNS): BalanceSuiteReport {
  const validRuns = requireRuns(runs)
  const standardMatchups = enemies.map((enemy): StandardMatchupReport => {
    const area = enemy.area as SimulatorArea
    const build = getStandardBuildForArea(area)
    const metrics = simulateBatch(
      build.items,
      enemy.id,
      validRuns,
      `standard:${build.id}`,
    )

    return {
      enemyId: enemy.id,
      enemyName: enemy.name,
      area,
      isBoss: enemy.isBoss,
      buildId: build.id,
      buildName: build.name,
      metrics,
      warnings: standardWarnings(enemy.name, enemy.isBoss, metrics),
    }
  })

  const counterScenarios: readonly CounterScenario[] = [
    {
      enemyId: 'EN_A1_04',
      baseline: getStandardBuildForArea(1),
      counter: diagnosticBuilds.forestDefense,
    },
    {
      enemyId: 'EN_A2_04',
      baseline: getStandardBuildForArea(2),
      counter: diagnosticBuilds.ruinsPierce,
    },
    {
      enemyId: 'EN_A3_02',
      baseline: getStandardBuildForArea(3),
      counter: diagnosticBuilds.castleBurn,
    },
  ]
  const counterComparisons = counterScenarios.map((scenario) =>
    compareCounterScenario(scenario, validRuns),
  )

  const banditStandard = simulateBatch(
    getStandardBuildForArea(1).items,
    'EN_A1_03',
    validRuns,
    'design:bandit:standard',
  )
  const banditRush = simulateBatch(
    diagnosticBuilds.banditRush.items,
    'EN_A1_03',
    validRuns,
    'design:bandit:rush',
  )
  const stoneGiantNoPierce = simulateBatch(
    getStandardBuildForArea(2).items,
    'EN_A2_05',
    validRuns,
    'design:stone:no-pierce',
  )
  const demonKingStandard = simulateBatch(
    getStandardBuildForArea(3).items,
    'EN_A3_05',
    validRuns,
    'design:demon:standard',
  )
  const demonKingLegendary = simulateBatch(
    diagnosticBuilds.demonKingLegendary.items,
    'EN_A3_05',
    validRuns,
    'design:demon:legendary',
  )

  const warnings = standardMatchups.flatMap((matchup) => matchup.warnings)

  for (const comparison of counterComparisons) {
    if (!comparison.passed) {
      warnings.push(
        `${comparison.enemyName} counter damage was not reduced to half or less ` +
          `(${comparison.baselineDamageTaken} -> ${comparison.counterDamageTaken})`,
      )
    }
  }

  if (banditStandard.fleeRatePercent < 10 || banditStandard.fleeRatePercent > 20) {
    warnings.push(
      `Bandit standard flee rate ${banditStandard.fleeRatePercent}% is outside the approximate 10-20% band`,
    )
  }
  if (banditRush.fleeRatePercent !== 0) {
    warnings.push(`Bandit rush flee rate should be 0%, got ${banditRush.fleeRatePercent}%`)
  }
  if (stoneGiantNoPierce.winRatePercent < 70) {
    warnings.push(
      `Stone Giant no-pierce win rate should be at least 70%, got ${stoneGiantNoPierce.winRatePercent}%`,
    )
  }
  if (demonKingStandard.winRatePercent < 55 || demonKingStandard.winRatePercent > 65) {
    warnings.push(
      `Demon King standard win rate ${demonKingStandard.winRatePercent}% is outside 55-65%`,
    )
  }
  if (demonKingLegendary.winRatePercent <= 85) {
    warnings.push(
      `Demon King legendary win rate should exceed 85%, got ${demonKingLegendary.winRatePercent}%`,
    )
  }

  return {
    runsPerMatchup: validRuns,
    standardMatchups,
    counterComparisons,
    bandit: {
      standard: banditStandard,
      rush: banditRush,
    },
    stoneGiantNoPierce,
    demonKing: {
      standard: demonKingStandard,
      legendary: demonKingLegendary,
    },
    warnings,
  }
}

export function formatBalanceReport(report: BalanceSuiteReport): string {
  const lines: string[] = [
    'Free-DH headless simulator',
    `Runs per matchup: ${report.runsPerMatchup}`,
    '',
    'STANDARD BUILDS',
    'Area | Enemy | Build | Win | Avg time | Avg damage | Flee',
  ]

  for (const matchup of report.standardMatchups) {
    lines.push(
      `${matchup.area} | ${matchup.enemyName} | ${matchup.buildName} | ` +
        `${formatPercent(matchup.metrics.winRatePercent)} | ` +
        `${formatNumber(matchup.metrics.averageDurationSeconds)}s | ` +
        `${formatNumber(matchup.metrics.averageDamageTaken)} | ` +
        `${formatPercent(matchup.metrics.fleeRatePercent)}`,
    )
  }

  lines.push('', 'DESIGN CHECKS')

  for (const comparison of report.counterComparisons) {
    const ratio = comparison.damageRatio === null ? 'n/a' : formatPercent(comparison.damageRatio * 100)
    pushCheck(
      lines,
      `${comparison.enemyName} counter damage <= 50%`,
      comparison.passed,
      `${formatNumber(comparison.baselineDamageTaken)} -> ` +
        `${formatNumber(comparison.counterDamageTaken)} (${ratio})`,
    )
  }

  pushCheck(
    lines,
    'Bandit standard flee rate around 15%',
    report.bandit.standard.fleeRatePercent >= 10 && report.bandit.standard.fleeRatePercent <= 20,
    formatPercent(report.bandit.standard.fleeRatePercent),
  )
  pushCheck(
    lines,
    'Bandit rush flee rate 0%',
    report.bandit.rush.fleeRatePercent === 0,
    formatPercent(report.bandit.rush.fleeRatePercent),
  )
  pushCheck(
    lines,
    'Stone Giant no-pierce win rate >= 70%',
    report.stoneGiantNoPierce.winRatePercent >= 70,
    formatPercent(report.stoneGiantNoPierce.winRatePercent),
  )
  pushCheck(
    lines,
    'Demon King standard win rate 55-65%',
    report.demonKing.standard.winRatePercent >= 55 &&
      report.demonKing.standard.winRatePercent <= 65,
    formatPercent(report.demonKing.standard.winRatePercent),
  )
  pushCheck(
    lines,
    'Demon King legendary win rate > 85%',
    report.demonKing.legendary.winRatePercent > 85,
    formatPercent(report.demonKing.legendary.winRatePercent),
  )

  lines.push('', `WARNINGS (${report.warnings.length})`)
  if (report.warnings.length === 0) {
    lines.push('None')
  } else {
    for (const warning of report.warnings) {
      lines.push(`- ${warning}`)
    }
  }

  return lines.join('\n')
}

export { diagnosticBuilds, standardBuilds }
export type { SimulatorBuild } from './builds'
