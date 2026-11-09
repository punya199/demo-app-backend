import { CRAFT_CATALYST_ID, CRAFT_ESSENCE_ID, CRAFT_RARE_ID } from '../equipment/craft-materials'
import { SICK_AFTER_HUNGRY_MINUTES } from '../core/monster-rules'
import {
  emptyFarmTiers,
  EnumFurnitureKind,
  farmEffects,
  farmUpgradeBlocker,
  findFurnitureRecipe,
  FURNITURE_KINDS,
  FURNITURE_RECIPES,
  furnitureRecipeId,
  NO_FARM_EFFECTS,
} from './farm-data'

const tiers = (over: Partial<Record<EnumFurnitureKind, number>>) => ({
  ...emptyFarmTiers(),
  ...over,
})

describe('farmEffects', () => {
  it('is the same as no furniture when nothing is owned', () => {
    expect(farmEffects(emptyFarmTiers())).toEqual(NO_FARM_EFFECTS)
  })

  it('stretches each timer by its own furniture only', () => {
    const effects = farmEffects(tiers({ table: 3, toilet: 1 }))
    expect(effects.fullnessDrain).toBeCloseTo(1 / 1.5)
    expect(effects.poopRate).toBeCloseTo(1 / 1.15)
    expect(effects.strengthDrain).toBe(1)
    expect(effects.sickAfterHungryMinutes).toBe(SICK_AFTER_HUNGRY_MINUTES)
  })

  it('doubles the hunger-to-sick time with a tier 3 bed, as a whole number of minutes', () => {
    expect(farmEffects(tiers({ bed: 3 })).sickAfterHungryMinutes).toBe(
      SICK_AFTER_HUNGRY_MINUTES * 2
    )
    const odd = farmEffects(tiers({ bed: 1 })).sickAfterHungryMinutes
    expect(Number.isInteger(odd)).toBe(true)
    expect(odd).toBe(Math.round(SICK_AFTER_HUNGRY_MINUTES * 1.25))
  })

  it('treats a tier outside 0-3 as the nearest valid one', () => {
    expect(farmEffects(tiers({ table: 9 })).fullnessDrain).toBeCloseTo(1 / 1.5)
    expect(farmEffects(tiers({ table: -2 })).fullnessDrain).toBe(1)
  })
})

describe('farmUpgradeBlocker', () => {
  it('only lets a kind go up one tier at a time', () => {
    const none = emptyFarmTiers()
    expect(farmUpgradeBlocker(EnumFurnitureKind.BED, 1, none)).toBeNull()
    expect(farmUpgradeBlocker(EnumFurnitureKind.BED, 2, none)).toMatch(/previous tier/)
    expect(farmUpgradeBlocker(EnumFurnitureKind.BED, 2, tiers({ bed: 1 }))).toBeNull()
    expect(farmUpgradeBlocker(EnumFurnitureKind.BED, 2, tiers({ bed: 2 }))).toMatch(/already owned/)
    expect(farmUpgradeBlocker(EnumFurnitureKind.BED, 4, tiers({ bed: 3 }))).toMatch(/no such tier/)
    expect(farmUpgradeBlocker(EnumFurnitureKind.BED, 0, none)).toMatch(/no such tier/)
  })
})

describe('furniture recipes', () => {
  it('has a tier 2 and a tier 3 craft for every kind, with unique ids', () => {
    expect(FURNITURE_RECIPES).toHaveLength(FURNITURE_KINDS.length * 2)
    expect(new Set(FURNITURE_RECIPES.map(recipe => recipe.id)).size).toBe(FURNITURE_RECIPES.length)
    expect(findFurnitureRecipe(furnitureRecipeId(EnumFurnitureKind.GYM, 3))?.tier).toBe(3)
    expect(findFurnitureRecipe('not_a_recipe')).toBeUndefined()
  })

  it('uses the element essence of the furniture, rune shards and, at tier 3, one Catalyst', () => {
    const table2 = findFurnitureRecipe(furnitureRecipeId(EnumFurnitureKind.TABLE, 2))!
    expect(table2).toMatchObject({ coin: 300, minutes: 30 })
    expect(table2.materials).toEqual([
      { itemId: CRAFT_ESSENCE_ID.leaf, qty: 3 },
      { itemId: CRAFT_RARE_ID.rune, qty: 1 },
    ])
    const bed3 = findFurnitureRecipe(furnitureRecipeId(EnumFurnitureKind.BED, 3))!
    expect(bed3).toMatchObject({ coin: 800, minutes: 240 })
    expect(bed3.materials).toEqual([
      { itemId: CRAFT_ESSENCE_ID.holy, qty: 4 },
      { itemId: CRAFT_RARE_ID.rune, qty: 2 },
      { itemId: CRAFT_CATALYST_ID, qty: 1 },
    ])
  })
})
