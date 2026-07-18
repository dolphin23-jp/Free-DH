import { describe, expect, it } from 'vitest'

import { affixPool, enemies, gameConfig, items, recipes } from '../src/data'

function expectUnique(values: string[]) {
  expect(new Set(values).size).toBe(values.length)
}

describe('game data', () => {
  it('loads every JSON document through its zod schema', () => {
    expect(items).toHaveLength(78)
    expect(enemies).toHaveLength(15)
    expect(recipes).toHaveLength(20)
    expect(affixPool).toHaveLength(8)
  })

  it('contains 60 regular items and 18 fusion-only items', () => {
    expect(items.filter((item) => !item.fusionOnly)).toHaveLength(60)
    expect(items.filter((item) => item.fusionOnly)).toHaveLength(18)
  })

  it('uses unique identifiers in every data collection', () => {
    expectUnique(items.map((item) => item.id))
    expectUnique(affixPool.map((affix) => affix.id))
    expectUnique(enemies.map((enemy) => enemy.id))
    expectUnique(recipes.map((recipe) => recipe.id))
  })

  it('only references existing items from recipes', () => {
    const itemIds = new Set(items.map((item) => item.id))

    for (const recipe of recipes) {
      expect(itemIds.has(recipe.a), `${recipe.id} ingredient a: ${recipe.a}`).toBe(true)
      expect(itemIds.has(recipe.b), `${recipe.id} ingredient b: ${recipe.b}`).toBe(true)
      expect(itemIds.has(recipe.result), `${recipe.id} result: ${recipe.result}`).toBe(true)
    }
  })

  it('has at least one reachable recipe for every fusion-only item', () => {
    const recipeResults = new Set(recipes.map((recipe) => recipe.result))
    const unreachableFusionItems = items
      .filter((item) => item.fusionOnly && !recipeResults.has(item.id))
      .map((item) => item.id)

    expect(unreachableFusionItems).toEqual([])
  })

  it('transcribes the core COMBAT_SPEC section 10 values', () => {
    expect(gameConfig.player).toMatchObject({
      initialHp: 100,
      staminaCap: 10,
      staminaRegenPerSecond: 1,
      blockCap: 30,
      baseCritChancePercent: 5,
      critMultiplier: 2,
      minimumCooldownSeconds: 0.3,
      maximumCooldownReductionPercent: 60,
      initialBag: { columns: 4, rows: 3 },
      storageSlots: 8,
      initialGold: 15,
    })
    expect(gameConfig.shop.rerollCosts).toEqual([5, 7, 10, 14, 19])
    expect(gameConfig.drops.bagExpansionSequence).toEqual([
      { columns: 4, rows: 3 },
      { columns: 5, rows: 3 },
      { columns: 5, rows: 4 },
      { columns: 6, rows: 4 },
    ])
  })
})
