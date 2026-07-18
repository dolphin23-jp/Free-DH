import { describe, expect, it } from 'vitest'

import { enemies, items } from '../src/data'
import {
  diagnosticBuilds,
  formatBalanceReport,
  runBalanceSuite,
  simulateBatch,
  standardBuilds,
} from '../src/sim'

describe('headless simulator', () => {
  it('defines valid standard and diagnostic builds with unique instance ids', () => {
    const itemIds = new Set(items.map((item) => item.id))
    const builds = [...standardBuilds, ...Object.values(diagnosticBuilds)]

    expect(standardBuilds.map((build) => build.area)).toEqual([1, 2, 3])

    for (const build of builds) {
      const instanceIds = build.items.map((item) => item.instanceId)

      expect(new Set(instanceIds).size).toBe(instanceIds.length)
      expect(build.items.every((item) => itemIds.has(item.itemId))).toBe(true)
    }
  })

  it('aggregates deterministic batch metrics for the same seed prefix', () => {
    const build = standardBuilds[0].items
    const first = simulateBatch(build, 'EN_A1_01', 3, 'test-batch')
    const second = simulateBatch(build, 'EN_A1_01', 3, 'test-batch')

    expect(second).toEqual(first)
    expect(first.runs).toBe(3)
    expect(first.wins + first.losses).toBe(3)
    expect(first.flees).toBeLessThanOrEqual(first.runs)
    expect(first.winRatePercent).toBeGreaterThanOrEqual(0)
    expect(first.winRatePercent).toBeLessThanOrEqual(100)
    expect(first.averageDurationSeconds).toBeGreaterThan(0)
    expect(first.averageDamageTaken).toBeGreaterThanOrEqual(0)
  })

  it('measures every ENEMIES section 9 validation category', () => {
    const report = runBalanceSuite(1)

    expect(report.standardMatchups).toHaveLength(enemies.length)
    expect(report.counterComparisons).toHaveLength(3)
    expect(report.bandit.standard.runs).toBe(1)
    expect(report.bandit.rush.runs).toBe(1)
    expect(report.stoneGiantNoPierce.runs).toBe(1)
    expect(report.demonKing.standard.runs).toBe(1)
    expect(report.demonKing.legendary.runs).toBe(1)
    expect(Array.isArray(report.warnings)).toBe(true)

    const output = formatBalanceReport(report)
    expect(output).toContain('STANDARD BUILDS')
    expect(output).toContain('DESIGN CHECKS')
    expect(output).toContain('Bandit')
    expect(output).toContain('Stone Giant')
    expect(output).toContain('Demon King')
  })

  it('rejects a non-positive or fractional run count', () => {
    expect(() => simulateBatch(standardBuilds[0].items, 'EN_A1_01', 0)).toThrow(
      'runs must be a positive integer',
    )
    expect(() => runBalanceSuite(1.5)).toThrow('runs must be a positive integer')
  })
})
