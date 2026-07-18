import { describe, expect, it } from 'vitest'

import { createCodexStore, exportCodexSnapshot, getEnemyPreview } from '../src/store/codex'
import { createRunStore } from '../src/store/run'
import { exportGameSave, loadGameSave } from '../src/store/save'

describe('enemy encounter preview', () => {
  it('switches from an unknown hint to full enemy data after registration', () => {
    const codex = createCodexStore()
    const enemyId = 'EN_A1_01'

    expect(getEnemyPreview(enemyId, codex.getState().discoveredEnemyIds)).toMatchObject({
      discovered: false,
      id: enemyId,
      name: '???',
      area: 1,
    })
    expect(getEnemyPreview(enemyId, codex.getState().discoveredEnemyIds).hint.length).toBeGreaterThan(0)

    codex.getState().discoverEnemy(enemyId)

    const known = getEnemyPreview(enemyId, codex.getState().discoveredEnemyIds)
    expect(known).toMatchObject({
      discovered: true,
      id: enemyId,
      area: 1,
    })
    if (known.discovered) {
      expect(known.name).not.toBe('???')
      expect(known.enemy.id).toBe(enemyId)
    }
  })
})

describe('codex progress', () => {
  it('records item, enemy, and recipe discoveries once in data order', () => {
    const codex = createCodexStore()

    codex.getState().discoverItems(['W02', 'W01', 'W02'])
    codex.getState().discoverEnemy('EN_A2_03')
    codex.getState().discoverRecipe('R01')

    expect(codex.getState().discoveredItemIds).toEqual(['W01', 'W02'])
    expect(codex.getState().discoveredEnemyIds).toEqual(['EN_A2_03'])
    expect(codex.getState().discoveredRecipeIds).toEqual(['R01'])
    expect(exportCodexSnapshot(codex.getState())).toMatchObject({
      version: 1,
      discoveredItemIds: ['W01', 'W02'],
      discoveredEnemyIds: ['EN_A2_03'],
      discoveredRecipeIds: ['R01'],
    })
  })

  it('rejects unknown discovery identifiers', () => {
    const codex = createCodexStore()
    expect(() => codex.getState().discoverItems(['NOT_AN_ITEM'])).toThrow('Unknown item id')
    expect(() => codex.getState().discoverEnemy('NOT_AN_ENEMY')).toThrow('Unknown enemy id')
    expect(() => codex.getState().discoverRecipe('NOT_A_RECIPE')).toThrow('Unknown recipe id')
  })
})

describe('combined save snapshot', () => {
  it('includes and restores codex data alongside the current run', () => {
    const run = createRunStore()
    const codex = createCodexStore()
    run.getState().startRun('codex-save')
    codex.getState().discoverItems(['W01', 'A01'])
    codex.getState().discoverEnemy('EN_A1_01')
    codex.getState().discoverRecipe('R03')

    const snapshot = JSON.parse(
      JSON.stringify(exportGameSave(run.getState(), codex.getState())),
    ) as ReturnType<typeof exportGameSave>

    expect(snapshot.codex).toMatchObject({
      discoveredItemIds: ['W01', 'A01'],
      discoveredEnemyIds: ['EN_A1_01'],
      discoveredRecipeIds: ['R03'],
    })

    const restoredRun = createRunStore()
    const restoredCodex = createCodexStore()
    loadGameSave(snapshot, restoredRun, restoredCodex)

    expect(restoredRun.getState().runSeed).toBe('codex-save')
    expect(restoredRun.getState().phase).toBe('preBattle')
    expect(restoredCodex.getState().discoveredItemIds).toEqual(['W01', 'A01'])
    expect(restoredCodex.getState().discoveredEnemyIds).toEqual(['EN_A1_01'])
    expect(restoredCodex.getState().discoveredRecipeIds).toEqual(['R03'])
  })

  it('validates both save halves before changing live stores', () => {
    const sourceRun = createRunStore()
    const sourceCodex = createCodexStore()
    sourceCodex.getState().discoverEnemy('EN_A1_01')
    const snapshot = exportGameSave(sourceRun.getState(), sourceCodex.getState())
    const invalid = {
      ...snapshot,
      codex: {
        ...snapshot.codex,
        discoveredEnemyIds: ['UNKNOWN'],
      },
    } as typeof snapshot

    const targetRun = createRunStore()
    const targetCodex = createCodexStore()
    targetCodex.getState().discoverEnemy('EN_A2_01')

    expect(() => loadGameSave(invalid, targetRun, targetCodex)).toThrow('unknown id')
    expect(targetRun.getState().phase).toBe('idle')
    expect(targetCodex.getState().discoveredEnemyIds).toEqual(['EN_A2_01'])
  })
})
