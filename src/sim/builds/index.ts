import type { BuildItemInput } from '../../engine/combat'

export type SimulatorArea = 1 | 2 | 3

export interface SimulatorBuild {
  id: string
  name: string
  area: SimulatorArea
  description: string
  items: readonly BuildItemInput[]
}

function item(
  instanceId: string,
  itemId: string,
  row: number,
  column: number,
  rotated = false,
): BuildItemInput {
  return {
    instanceId,
    itemId,
    position: { row, column },
    ...(rotated ? { rotated: true } : {}),
  }
}

export const standardBuilds = [
  {
    id: 'standard-area-1',
    name: 'Forest standard',
    area: 1,
    description: 'Common offense, poison, and a basic shield for area 1.',
    items: [
      item('forest-sword', 'W02', 0, 0),
      item('forest-shield', 'A01', 0, 1),
      item('forest-poison', 'T05', 2, 0),
      item('forest-charm', 'C01', 2, 1),
    ],
  },
  {
    id: 'standard-area-2',
    name: 'Ruins standard',
    area: 2,
    description: 'A no-pierce area 2 build used to verify that armor enemies are not hard locks.',
    items: [
      item('ruins-greatsword', 'W06', 0, 0),
      item('ruins-fire-sword', 'W13', 0, 2),
      item('ruins-poison', 'T09', 3, 0),
      item('ruins-shield', 'A05', 3, 1),
      item('ruins-holy-water', 'T07', 2, 3),
    ],
  },
  {
    id: 'standard-area-3',
    name: 'Castle standard',
    area: 3,
    description: 'Late-run damage, poison, block, and cleanse for area 3.',
    items: [
      item('castle-dragon-sword', 'W14', 0, 0),
      item('castle-war-greatsword', 'F14', 0, 2),
      item('castle-cauldron', 'F07', 3, 0),
      item('castle-greatshield', 'A10', 3, 2),
      item('castle-holy-water', 'T07', 2, 4),
    ],
  },
] as const satisfies readonly SimulatorBuild[]

export const diagnosticBuilds = {
  forestDefense: {
    id: 'counter-forest-defense',
    name: 'Forest opening defense',
    area: 1,
    description: 'Opening block and flat mitigation intended to answer the wolf frenzy.',
    items: [
      item('defense-sword', 'W02', 0, 0),
      item('defense-shield', 'A01', 0, 1),
      item('defense-mantle', 'A07', 2, 0),
      item('defense-helmet', 'A03', 2, 2),
      item('defense-poison', 'T05', 3, 0),
    ],
  },
  ruinsPierce: {
    id: 'counter-ruins-pierce',
    name: 'Ruins pierce control',
    area: 2,
    description: 'Pierce, poison, and slow intended to answer regenerating block.',
    items: [
      item('pierce-spear', 'W12', 0, 0),
      item('pierce-siege-spear', 'F15', 0, 2),
      item('pierce-poison', 'T09', 3, 0),
      item('pierce-slow', 'T10', 3, 1),
      item('pierce-shield', 'A05', 3, 2),
    ],
  },
  castleBurn: {
    id: 'counter-castle-burn',
    name: 'Castle burn control',
    area: 3,
    description: 'Persistent burn and cleanse intended to answer lifesteal and enemy burn.',
    items: [
      item('burn-fire-sword', 'W13', 0, 0),
      item('burn-bottle', 'F11', 0, 2),
      item('burn-siege-spear', 'F15', 2, 0),
      item('burn-greatshield', 'A10', 2, 2),
      item('burn-holy-water', 'T07', 4, 0),
    ],
  },
  banditRush: {
    id: 'diagnostic-bandit-rush',
    name: 'Bandit rush',
    area: 1,
    description: 'Fast weapons intended to kill the bandit before its eighth hit.',
    items: [
      item('rush-twin-fang', 'F04', 0, 0),
      item('rush-rapier', 'W07', 0, 2),
      item('rush-assassin', 'W10', 1, 0),
      item('rush-master-sword', 'F01', 1, 2),
    ],
  },
  demonKingLegendary: {
    id: 'diagnostic-demon-legendary',
    name: 'Demon king legendary',
    area: 3,
    description: 'A late build containing the legendary Philosopher Stone for the orange-item check.',
    items: [
      item('legend-hero-sword', 'E07', 0, 0),
      item('legend-siege-spear', 'F15', 0, 2),
      item('legend-cauldron', 'F07', 2, 0),
      item('legend-greatshield', 'A10', 2, 2),
      item('legend-philosopher-stone', 'C14', 1, 1),
      item('legend-holy-water', 'T07', 4, 0),
    ],
  },
} as const satisfies Record<string, SimulatorBuild>

export function getStandardBuildForArea(area: SimulatorArea): SimulatorBuild {
  const build = standardBuilds.find((candidate) => candidate.area === area)

  if (build === undefined) {
    throw new Error(`No standard simulator build for area ${area}`)
  }

  return build
}
