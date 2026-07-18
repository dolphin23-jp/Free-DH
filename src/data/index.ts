import configJson from './config.json'
import enemiesJson from './enemies.json'
import itemsJson from './items.json'
import recipesJson from './recipes.json'
import { configSchema, enemiesDataSchema, itemsDataSchema, recipesDataSchema } from './schema'

export const itemsData = itemsDataSchema.parse(itemsJson)
export const enemiesData = enemiesDataSchema.parse(enemiesJson)
export const recipesData = recipesDataSchema.parse(recipesJson)
export const gameConfig = configSchema.parse(configJson)

export const items = itemsData.items
export const affixPool = itemsData.affixPool
export const enemies = enemiesData.enemies
export const recipes = recipesData.recipes

export * from './schema'
