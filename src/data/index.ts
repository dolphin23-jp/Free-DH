import configJson from './config.json'
import enemiesJson from './enemies.json'
import itemsJson from './items.json'
import recipesJson from './recipes.json'
import { configSchema, enemiesDataSchema, itemsDataSchema, recipesDataSchema } from './schema'
import type { Enemy } from './schema'

export const itemsData = itemsDataSchema.parse(itemsJson)
export const enemiesData = enemiesDataSchema.parse(enemiesJson)
export const recipesData = recipesDataSchema.parse(recipesJson)
export const gameConfig = configSchema.parse(configJson)

type StandardEnemy = Extract<Enemy, { hp: number }>
type PhasedEnemy = Exclude<Enemy, StandardEnemy>
export type RuntimeEnemy = (StandardEnemy & { phases?: undefined }) | PhasedEnemy

export const items = itemsData.items
export const affixPool = itemsData.affixPool
// Preserve the parsed runtime values while making `phases` an explicit union discriminator.
export const enemies = enemiesData.enemies as RuntimeEnemy[]
export const recipes = recipesData.recipes

export * from './schema'
