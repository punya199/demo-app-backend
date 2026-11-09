import { CRAFT_CATALYST_ID, CRAFT_ESSENCE_ID, CRAFT_RARE_ID } from '../equipment/craft-materials'
import type { CraftEssence } from '../equipment/craft-sets'
import { SICK_AFTER_HUNGRY_MINUTES } from '../core/monster-rules'

// The Farm (docs/adr/0001-farm-effects-are-server-side.md): one piece of furniture per Care timer,
// tier 1 bought with Coin, tiers 2 and 3 crafted through the craft queue. A tier stretches the
// timer's minutes by (1 + bonus) for every living monster of the player. Pure rules, no DB.

export enum EnumFurnitureKind {
  TABLE = 'table', // hungry minutes: fullness drains slower
  GYM = 'gym', // weak minutes: strength drains slower
  TOILET = 'toilet', // poop minutes: it poops slower
  BED = 'bed', // sick minutes: hunger makes it sick later
}

export const FURNITURE_KINDS = Object.values(EnumFurnitureKind)
export const MAX_FURNITURE_TIER = 3

// Bonus on the timer's minutes at tier 0 (none), 1, 2 and 3.
export const FURNITURE_BONUS: Record<EnumFurnitureKind, readonly number[]> = {
  [EnumFurnitureKind.TABLE]: [0, 0.15, 0.3, 0.5],
  [EnumFurnitureKind.GYM]: [0, 0.15, 0.3, 0.5],
  [EnumFurnitureKind.TOILET]: [0, 0.15, 0.3, 0.5],
  [EnumFurnitureKind.BED]: [0, 0.25, 0.5, 1],
}

// Tier 1 is bought for Coin.
export const FURNITURE_BUY_COIN = 240

// Tiers 2 and 3 are crafts: the same queue as equipment, always succeed (no dice, no pity), and the
// Catalyst of tier 3 is an ordinary ingredient. The essence element follows the furniture.
export const FURNITURE_ESSENCE: Record<EnumFurnitureKind, CraftEssence> = {
  [EnumFurnitureKind.TABLE]: 'leaf',
  [EnumFurnitureKind.GYM]: 'earth',
  [EnumFurnitureKind.TOILET]: 'tide',
  [EnumFurnitureKind.BED]: 'holy',
}

export const FURNITURE_CRAFT = {
  2: { coin: 300, minutes: 30, essence: 3, rune: 1, catalyst: 0 },
  3: { coin: 800, minutes: 240, essence: 4, rune: 2, catalyst: 1 },
} as const

export interface IFurnitureRecipe {
  id: string
  kind: EnumFurnitureKind
  // The tier this craft produces.
  tier: 2 | 3
  coin: number
  minutes: number
  materials: { itemId: string; qty: number }[]
}

export const furnitureRecipeId = (kind: EnumFurnitureKind, tier: number) => `farm_${kind}:${tier}`

const recipeOf = (kind: EnumFurnitureKind, tier: 2 | 3): IFurnitureRecipe => {
  const need = FURNITURE_CRAFT[tier]
  return {
    id: furnitureRecipeId(kind, tier),
    kind,
    tier,
    coin: need.coin,
    minutes: need.minutes,
    materials: [
      { itemId: CRAFT_ESSENCE_ID[FURNITURE_ESSENCE[kind]], qty: need.essence },
      { itemId: CRAFT_RARE_ID.rune, qty: need.rune },
      ...(need.catalyst ? [{ itemId: CRAFT_CATALYST_ID, qty: need.catalyst }] : []),
    ],
  }
}

export const FURNITURE_RECIPES: IFurnitureRecipe[] = FURNITURE_KINDS.flatMap(kind => [
  recipeOf(kind, 2),
  recipeOf(kind, 3),
])

const RECIPE_BY_ID = new Map(FURNITURE_RECIPES.map(recipe => [recipe.id, recipe]))
export const findFurnitureRecipe = (recipeId: string) => RECIPE_BY_ID.get(recipeId)

export type FarmTiers = Record<EnumFurnitureKind, number>

export const emptyFarmTiers = (): FarmTiers => ({
  [EnumFurnitureKind.TABLE]: 0,
  [EnumFurnitureKind.GYM]: 0,
  [EnumFurnitureKind.TOILET]: 0,
  [EnumFurnitureKind.BED]: 0,
})

const bonusOf = (kind: EnumFurnitureKind, tier: number) =>
  FURNITURE_BONUS[kind][Math.max(0, Math.min(MAX_FURNITURE_TIER, Math.trunc(tier) || 0))]

// What the engine multiplies in. Drains and the poop rate shrink by 1 / (1 + bonus); the sick
// threshold is an integer count of minutes (the engine compares it with ===). The death timers and
// the lifespan are deliberately not here: furniture never makes a neglected monster immortal.
export interface IFarmEffects {
  fullnessDrain: number
  strengthDrain: number
  poopRate: number
  sickAfterHungryMinutes: number
}

export const NO_FARM_EFFECTS: IFarmEffects = {
  fullnessDrain: 1,
  strengthDrain: 1,
  poopRate: 1,
  sickAfterHungryMinutes: SICK_AFTER_HUNGRY_MINUTES,
}

export const farmEffects = (tiers: FarmTiers): IFarmEffects => ({
  fullnessDrain: 1 / (1 + bonusOf(EnumFurnitureKind.TABLE, tiers.table)),
  strengthDrain: 1 / (1 + bonusOf(EnumFurnitureKind.GYM, tiers.gym)),
  poopRate: 1 / (1 + bonusOf(EnumFurnitureKind.TOILET, tiers.toilet)),
  sickAfterHungryMinutes: Math.round(
    SICK_AFTER_HUNGRY_MINUTES * (1 + bonusOf(EnumFurnitureKind.BED, tiers.bed))
  ),
})

// Why a purchase or craft is refused, or null when it is allowed.
export const farmUpgradeBlocker = (
  kind: EnumFurnitureKind,
  toTier: number,
  tiers: FarmTiers
): string | null => {
  if (toTier < 1 || toTier > MAX_FURNITURE_TIER) {
    return 'There is no such tier'
  }
  if (tiers[kind] >= toTier) {
    return 'This tier is already owned'
  }
  if (tiers[kind] !== toTier - 1) {
    return 'Upgrade the previous tier first'
  }
  return null
}
