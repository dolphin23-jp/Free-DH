import { z } from 'zod'

export const raritySchema = z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary'])
export const itemTagSchema = z.enum(['weapon', 'shield', 'armor', 'tool', 'bottle', 'trinket'])
export const enemyTagSchema = z.enum(['undead'])
export const statusSchema = z.enum(['poison', 'burn', 'slow'])
export const triggerSchema = z.enum([
  'battleStart',
  'onHit',
  'onKill',
  'onDamaged',
  'onBlocked',
  'battleWin',
  'hpBelow',
])

const finiteNumberSchema = z.number().finite()
const nonNegativeNumberSchema = finiteNumberSchema.nonnegative()
const positiveNumberSchema = finiteNumberSchema.positive()

export const activeEffectSchema = z
  .object({
    type: z.enum(['damage', 'block', 'heal', 'applyStatus', 'cleanseSelf']),
    value: finiteNumberSchema.optional(),
    status: statusSchema.optional(),
    oncePerBattle: z.boolean().optional(),
    pierce: z.boolean().optional(),
  })
  .strict()
  .superRefine((effect, context) => {
    if (effect.type === 'cleanseSelf') {
      if (effect.value !== undefined || effect.status !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'cleanseSelf must not define value or status',
        })
      }
      return
    }

    if (effect.value === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `${effect.type} requires value` })
    }

    if (effect.type === 'applyStatus' && effect.status === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'applyStatus requires status' })
    }
  })

export const passiveSchema = z
  .object({
    type: z.enum([
      'maxHp',
      'maxHpMult',
      'damageReduction',
      'critChance',
      'critMultiplier',
      'damageMult',
      'allCdMult',
      'staminaRegen',
      'blockCapBonus',
      'sellBonus',
      'dropLuck',
      'flatDamage',
      'staminaMult',
      'cdMult',
      'blockFlat',
    ]),
    value: finiteNumberSchema,
    condition: z.enum(['hpBelow50']).optional(),
    selfOnly: z.boolean().optional(),
  })
  .strict()

export const triggerEffectSchema = z
  .object({
    trigger: triggerSchema,
    type: z.enum(['damage', 'block', 'heal', 'gold', 'reflect', 'applyStatus']),
    value: finiteNumberSchema,
    status: statusSchema.optional(),
    thresholdPercent: nonNegativeNumberSchema.max(100).optional(),
  })
  .strict()
  .superRefine((effect, context) => {
    if (effect.type === 'applyStatus' && effect.status === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'applyStatus requires status' })
    }

    if (effect.trigger !== 'hpBelow' && effect.thresholdPercent !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'thresholdPercent is only valid for hpBelow triggers',
      })
    }
  })

export const adjacencySchema = z
  .object({
    target: z.enum(['weapon', 'shield', 'bottle', 'all']),
    type: z.enum([
      'critChance',
      'cdMult',
      'staminaMult',
      'flatDamage',
      'blockFlat',
      'onHitPoison',
      'onHitHeal',
      'onHitGold',
      'effectMult',
    ]),
    value: finiteNumberSchema,
    range8: z.boolean().optional(),
  })
  .strict()

export const affixSchema = z
  .object({
    id: z.string().regex(/^AF\d{2}$/),
    name: z.string().min(1),
    target: z.enum(['weapon', 'shield', 'active', 'any']),
    passive: passiveSchema.optional(),
    trigger: triggerEffectSchema.optional(),
  })
  .strict()
  .refine((affix) => Number(affix.passive !== undefined) + Number(affix.trigger !== undefined) === 1, {
    message: 'An affix must define exactly one passive or trigger',
  })

const specialsRequiringValue = new Set([
  'execute',
  'battleScalingDamage',
  'runScalingDamage',
  'poisonFinisher',
  'guardianHeal',
  'runMaxHpOnKill',
  'undeadSlayer',
  'healPercentOnWin',
])

export const itemSchema = z
  .object({
    id: z.string().regex(/^(W|A|T|C|E|F)\d{2}$/),
    name: z.string().min(1),
    rarity: raritySchema,
    size: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    tags: z.array(itemTagSchema).min(1),
    weight: z.number().int().positive(),
    unlockCost: z.number().int().nonnegative(),
    fusionOnly: z.boolean(),
    cooldown: positiveNumberSchema.optional(),
    stamina: nonNegativeNumberSchema.optional(),
    effects: z.array(activeEffectSchema).min(1).optional(),
    passives: z.array(passiveSchema).min(1).optional(),
    triggers: z.array(triggerEffectSchema).min(1).optional(),
    adjacency: z.array(adjacencySchema).min(1).optional(),
    special: z
      .enum([
        'openingShot',
        'execute',
        'battleScalingDamage',
        'runScalingDamage',
        'poisonFinisher',
        'guardianHeal',
        'sealAdjacent',
        'duplicateAdjacent',
        'readyAllCooldowns',
        'runMaxHpOnKill',
        'undeadSlayer',
        'healPercentOnWin',
      ])
      .optional(),
    specialValue: finiteNumberSchema.optional(),
    sellOverride: nonNegativeNumberSchema.optional(),
  })
  .strict()
  .superRefine((item, context) => {
    const hasCooldown = item.cooldown !== undefined
    const hasStamina = item.stamina !== undefined

    if (hasCooldown !== hasStamina) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Active items must define cooldown and stamina together',
      })
    }

    if (item.effects !== undefined && !hasCooldown) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Items with active effects must define cooldown and stamina',
      })
    }

    if (
      item.special !== undefined &&
      specialsRequiringValue.has(item.special) &&
      item.specialValue === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${item.special} requires specialValue`,
      })
    }
  })

export const itemsDataSchema = z
  .object({
    $comment: z.string().optional(),
    affixPool: z.array(affixSchema),
    items: z.array(itemSchema),
  })
  .strict()

export const enemyEffectSchema = z
  .object({
    type: z.enum(['damage', 'goldSteal', 'applyStatus']),
    value: finiteNumberSchema,
    status: statusSchema.optional(),
  })
  .strict()
  .superRefine((effect, context) => {
    if (effect.type === 'applyStatus' && effect.status === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'applyStatus requires status' })
    }
  })

export const enemyAbilitySchema = z
  .object({
    name: z.string().min(1),
    cooldown: positiveNumberSchema,
    effects: z.array(enemyEffectSchema).min(1),
  })
  .strict()

export const enemyTraitSchema = z
  .object({
    type: z.enum([
      'hpRegen',
      'blockRegen',
      'revive',
      'lifesteal',
      'fleeAfterHits',
      'openingFrenzy',
      'enrage',
      'staminaDrain',
      'thorns',
      'sealRandomItem',
    ]),
    value: finiteNumberSchema,
    duration: positiveNumberSchema.optional(),
    interval: positiveNumberSchema.optional(),
    cap: nonNegativeNumberSchema.optional(),
    disabledBy: statusSchema.optional(),
    killBonus: nonNegativeNumberSchema.optional(),
  })
  .strict()

const enemyMetadataShape = {
  id: z.string().regex(/^EN_A[1-3]_\d{2}$/),
  name: z.string().min(1),
  area: z.number().int().min(1).max(3),
  isBoss: z.boolean(),
  gold: z.number().int().nonnegative(),
  hint: z.string().min(1),
  counterTags: z.array(z.string().min(1)),
  tags: z.array(enemyTagSchema).optional(),
}

export const enemyPhaseSchema = z
  .object({
    name: z.string().min(1),
    hp: positiveNumberSchema,
    abilities: z.array(enemyAbilitySchema).min(1),
    traits: z.array(enemyTraitSchema),
  })
  .strict()

const standardEnemySchema = z
  .object({
    ...enemyMetadataShape,
    hp: positiveNumberSchema,
    abilities: z.array(enemyAbilitySchema).min(1),
    traits: z.array(enemyTraitSchema),
  })
  .strict()

const phasedEnemySchema = z
  .object({
    ...enemyMetadataShape,
    phases: z.array(enemyPhaseSchema).min(2),
  })
  .strict()

export const enemySchema = z.union([standardEnemySchema, phasedEnemySchema])

export const enemiesDataSchema = z
  .object({
    $comment: z.string().optional(),
    enemies: z.array(enemySchema),
  })
  .strict()

export const recipeSchema = z
  .object({
    id: z.string().regex(/^R\d{2}$/),
    a: z.string().regex(/^(W|A|T|C|E|F)\d{2}$/),
    b: z.string().regex(/^(W|A|T|C|E|F)\d{2}$/),
    result: z.string().regex(/^(W|A|T|C|E|F)\d{2}$/),
  })
  .strict()

export const recipesDataSchema = z
  .object({
    $comment: z.string().optional(),
    recipes: z.array(recipeSchema),
  })
  .strict()

const bagSizeSchema = z
  .object({
    columns: z.number().int().positive(),
    rows: z.number().int().positive(),
  })
  .strict()

const rarityDistributionSchema = z
  .object({
    common: nonNegativeNumberSchema,
    uncommon: nonNegativeNumberSchema,
    rare: nonNegativeNumberSchema,
    epic: nonNegativeNumberSchema,
    legendary: nonNegativeNumberSchema,
  })
  .strict()
  .refine(
    (distribution) =>
      distribution.common +
        distribution.uncommon +
        distribution.rare +
        distribution.epic +
        distribution.legendary ===
      100,
    { message: 'Rarity distribution must total 100 percent' },
  )

const affixCountSchema = z
  .object({
    minimum: z.number().int().nonnegative(),
    maximum: z.number().int().nonnegative(),
    secondAffixChancePercent: nonNegativeNumberSchema.max(100),
  })
  .strict()
  .refine((count) => count.minimum <= count.maximum, {
    message: 'minimum must be less than or equal to maximum',
  })

export const configSchema = z
  .object({
    $comment: z.string().optional(),
    player: z
      .object({
        initialHp: positiveNumberSchema,
        staminaCap: positiveNumberSchema,
        staminaRegenPerSecond: positiveNumberSchema,
        blockCap: nonNegativeNumberSchema,
        baseCritChancePercent: nonNegativeNumberSchema.max(100),
        critMultiplier: positiveNumberSchema,
        minimumCooldownSeconds: positiveNumberSchema,
        maximumCooldownReductionPercent: nonNegativeNumberSchema.max(100),
        initialBag: bagSizeSchema,
        storageSlots: z.number().int().nonnegative(),
        initialGold: z.number().int().nonnegative(),
      })
      .strict(),
    combat: z
      .object({
        suddenDeath: z
          .object({
            startSeconds: z.number().int().positive(),
            initialDamage: positiveNumberSchema,
            damagePerSecond: positiveNumberSchema,
          })
          .strict(),
      })
      .strict(),
    drops: z
      .object({
        normalSlots: z.number().int().positive(),
        bossSlots: z.number().int().positive(),
        eliteBonusSlots: z.number().int().nonnegative(),
        bagExpansionSequence: z.array(bagSizeSchema).min(1),
        shopOnlyFinalExpansion: bagSizeSchema.extend({ cost: z.number().int().nonnegative() }),
        rarityPercentByArea: z
          .object({
            '1': rarityDistributionSchema,
            '2': rarityDistributionSchema,
            '3': rarityDistributionSchema,
          })
          .strict(),
        abyssShiftPercentPerLevel: z
          .object({
            rare: nonNegativeNumberSchema,
            epic: nonNegativeNumberSchema,
            legendary: nonNegativeNumberSchema,
          })
          .strict(),
        legendaryPity: z
          .object({
            startsAfterBattles: z.number().int().nonnegative(),
            increasePercentPerBattle: nonNegativeNumberSchema,
          })
          .strict(),
        affixesPerRarity: z
          .object({
            common: affixCountSchema,
            uncommon: affixCountSchema,
            rare: affixCountSchema,
            epic: affixCountSchema,
            legendary: affixCountSchema,
          })
          .strict(),
      })
      .strict(),
    shop: z
      .object({
        slots: z.number().int().positive(),
        rerollCosts: z.array(z.number().int().nonnegative()).min(1),
        purchasePriceByRarity: z
          .object({
            common: z.number().int().nonnegative(),
            uncommon: z.number().int().nonnegative(),
            rare: z.number().int().nonnegative(),
            epic: z.number().int().nonnegative(),
            legendary: z.number().int().nonnegative(),
          })
          .strict(),
        sellPriceRate: nonNegativeNumberSchema.max(1),
        healService: z
          .object({
            cost: z.number().int().nonnegative(),
            hp: positiveNumberSchema,
            usesPerShop: z.number().int().positive(),
          })
          .strict(),
        cursedChest: z
          .object({
            appearanceChancePercent: nonNegativeNumberSchema.max(100),
            cost: z.number().int().nonnegative(),
            minimumRarity: raritySchema,
            maxHpPenalty: nonNegativeNumberSchema,
          })
          .strict(),
        gambler: z
          .object({
            appearanceChancePercent: nonNegativeNumberSchema.max(100),
            cost: z.number().int().nonnegative(),
            rarityPercentEach: nonNegativeNumberSchema.max(100),
          })
          .strict(),
      })
      .strict(),
    bossChoice: z
      .object({
        healMaxHpPercent: nonNegativeNumberSchema.max(100),
        additionalDropSlots: z.number().int().nonnegative(),
      })
      .strict(),
    souls: z
      .object({
        abyssMultiplierPerLevel: nonNegativeNumberSchema,
        clearBonus: z.number().int().nonnegative(),
        unlockCostByRarity: z
          .object({
            rare: z.number().int().nonnegative(),
            epic: z.number().int().nonnegative(),
            legendary: z.number().int().nonnegative(),
          })
          .strict(),
        classUnlockCost: z.number().int().nonnegative(),
      })
      .strict(),
    abyss: z
      .object({
        maximumLevel: z.number().int().positive(),
        enemyHpMultiplierPerLevel: nonNegativeNumberSchema,
        enemyAttackMultiplierPerLevel: nonNegativeNumberSchema,
        eliteStartsAtLevel: z.number().int().nonnegative(),
        eliteHpBonusMultiplier: nonNegativeNumberSchema,
        eliteDropBonusSlots: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict()

export type Rarity = z.infer<typeof raritySchema>
export type EnemyTag = z.infer<typeof enemyTagSchema>
export type ActiveEffect = z.infer<typeof activeEffectSchema>
export type Passive = z.infer<typeof passiveSchema>
export type TriggerEffect = z.infer<typeof triggerEffectSchema>
export type Adjacency = z.infer<typeof adjacencySchema>
export type Affix = z.infer<typeof affixSchema>
export type Item = z.infer<typeof itemSchema>
export type ItemsData = z.infer<typeof itemsDataSchema>
export type EnemyEffect = z.infer<typeof enemyEffectSchema>
export type EnemyAbility = z.infer<typeof enemyAbilitySchema>
export type EnemyTrait = z.infer<typeof enemyTraitSchema>
export type EnemyPhase = z.infer<typeof enemyPhaseSchema>
export type Enemy = z.infer<typeof enemySchema>
export type EnemiesData = z.infer<typeof enemiesDataSchema>
export type Recipe = z.infer<typeof recipeSchema>
export type RecipesData = z.infer<typeof recipesDataSchema>
export type GameConfig = z.infer<typeof configSchema>
