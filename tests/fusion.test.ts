import { describe, expect, it } from 'vitest'

import { recipes } from '../src/data'
import { getItemDefinition } from '../src/store/bag'
import {
  findFusionCandidates,
  fuseInventory,
  matchFusionRecipe,
} from '../src/store/fusion'
import type { RunInventoryItem, RunInventorySnapshot } from '../src/store/run'

function material(instanceId: string, itemId: string): RunInventoryItem {
  return {
    instanceId,
    itemId,
    affixIds: ['AF05'],
    rotated: false,
    runDamageBonus: 1,
  }
}

function inventoryForRecipe(recipeId: string): RunInventorySnapshot {
  const recipe = recipes.find((candidate) => candidate.id === recipeId)
  if (recipe === undefined) throw new Error(`Missing recipe ${recipeId}`)
  const [firstColumns] = getItemDefinition(recipe.a).size

  return {
    bag: {
      columns: 12,
      rows: 12,
      items: [
        { ...material(`${recipe.id}-a`, recipe.a), position: { row: 1, column: 1 } },
        {
          ...material(`${recipe.id}-b`, recipe.b),
          position: { row: 1, column: 1 + firstColumns },
        },
      ],
    },
    storage: { capacity: 8, items: [] },
  }
}

describe('fusion recipe matching', () => {
  it('matches every R01-R20 recipe regardless of ingredient order', () => {
    expect(recipes).toHaveLength(20)

    for (const recipe of recipes) {
      expect(matchFusionRecipe(recipe.a, recipe.b)?.id).toBe(recipe.id)
      expect(matchFusionRecipe(recipe.b, recipe.a)?.id).toBe(recipe.id)
    }
  })

  it('detects and completes every adjacent recipe', () => {
    for (const recipe of recipes) {
      const inventory = inventoryForRecipe(recipe.id)
      const candidates = findFusionCandidates(inventory.bag)
      expect(candidates).toHaveLength(1)
      expect(candidates[0]).toMatchObject({
        recipeId: recipe.id,
        resultItemId: recipe.result,
      })

      const completed = fuseInventory(inventory, candidates[0]!)
      expect(completed.recipe.id).toBe(recipe.id)
      expect(completed.resultItem.itemId).toBe(recipe.result)
      expect(completed.inventory.bag.items).toHaveLength(1)
      expect(completed.inventory.bag.items[0]?.instanceId).toBe(completed.resultItem.instanceId)
      expect(completed.resultItem.affixIds).toEqual([])
      expect(completed.resultItem.runDamageBonus).toBe(0)
    }
  })
})

describe('fusion confirmation boundary', () => {
  it('only reports a candidate and does not consume materials before execution', () => {
    const inventory = inventoryForRecipe('R01')
    const before = structuredClone(inventory)

    expect(findFusionCandidates(inventory.bag)).toHaveLength(1)
    expect(inventory).toEqual(before)
  })

  it('does not report matching ingredients that are not orthogonally adjacent', () => {
    const inventory = inventoryForRecipe('R01')
    inventory.bag.items[1]!.position = { row: 8, column: 8 }

    expect(findFusionCandidates(inventory.bag)).toEqual([])
  })

  it('rejects a stale confirmation after either material moves', () => {
    const inventory = inventoryForRecipe('R01')
    const candidate = findFusionCandidates(inventory.bag)[0]!
    inventory.bag.items[1]!.position = { row: 8, column: 8 }

    expect(() => fuseInventory(inventory, candidate)).toThrow(
      'Fusion materials are no longer adjacent',
    )
    expect(inventory.bag.items).toHaveLength(2)
  })
})
