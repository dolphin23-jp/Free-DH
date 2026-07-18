import { describe, expect, it } from 'vitest'

import { simulate, type BuildItemInput } from '../src/engine/combat'
import { hashSeed } from '../src/engine/rng'

const noCritical = { critChancePercent: -100 }

const cases: readonly {
  name: string
  build: readonly BuildItemInput[]
  enemyId: string
  seed: string
  hash: string
}[] = [
  {
    name: 'basic weapon versus goblin',
    build: [
      {
        instanceId: 'sword',
        itemId: 'W02',
        position: { row: 0, column: 0 },
        initialCooldown: 0,
        resolvedModifiers: noCritical,
      },
    ],
    enemyId: 'EN_A1_01',
    seed: 'golden:goblin',
    hash: 'b362eb39',
  },
  {
    name: 'burn build versus vampire',
    build: [
      {
        instanceId: 'fire-sword',
        itemId: 'W13',
        position: { row: 0, column: 0 },
        initialCooldown: 0,
        resolvedModifiers: noCritical,
      },
      {
        instanceId: 'shield',
        itemId: 'A05',
        position: { row: 1, column: 0 },
        initialCooldown: 0,
      },
    ],
    enemyId: 'EN_A3_02',
    seed: 'golden:vampire',
    hash: 'f6266d2b',
  },
  {
    name: 'poison and pierce versus demon king',
    build: [
      {
        instanceId: 'spear',
        itemId: 'F15',
        position: { row: 0, column: 0 },
        initialCooldown: 0,
        resolvedModifiers: noCritical,
      },
      {
        instanceId: 'poison',
        itemId: 'F07',
        position: { row: 1, column: 0 },
        initialCooldown: 0,
      },
      {
        instanceId: 'greatshield',
        itemId: 'A10',
        position: { row: 2, column: 0 },
        initialCooldown: 0,
      },
    ],
    enemyId: 'EN_A3_05',
    seed: 'golden:demon-king',
    hash: '348a7177',
  },
]

function hashEvents(events: unknown): string {
  return hashSeed(JSON.stringify(events)).toString(16).padStart(8, '0')
}

describe('simulate API', () => {
  it.each(cases)('is deterministic for $name', ({ build, enemyId, seed }) => {
    expect(simulate(build, enemyId, seed)).toEqual(simulate(build, enemyId, seed))
  })

  it.each(cases)('keeps the golden event hash for $name', ({ build, enemyId, seed, hash }) => {
    const simulation = simulate(build, enemyId, seed)

    expect(simulation.result).not.toBe('ongoing')
    expect(simulation.events.at(-1)).toMatchObject({ type: 'end' })
    expect(hashEvents(simulation.events)).toBe(hash)
  })
})
