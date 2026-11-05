import { ADVENTURE_AREAS } from './adventure-data'
import {
  CRAFT_ADVENTURE_ESSENCE,
  CRAFT_CATALYST_CHANCE,
  CRAFT_PITY_AFTER_FAILS,
  CRAFT_RECIPES,
  CRAFT_TIERS,
  calcCraftSkipCoin,
  craftFinishAt,
  findCraftRecipe,
  raidCoreDrops,
  recipeNeeds,
  rollAdventureEssence,
  rollCraftGrade,
  worldBossCraftDrops,
} from './craft-data'
import {
  CRAFT_CATALYST_ID,
  CRAFT_ESSENCE_ID,
  CRAFT_MATERIAL_DEFS,
  CRAFT_UNIQUE_ID,
} from './craft-materials'
import { CRAFT_SETS } from './craft-sets'
import {
  EnumEquipmentGrade,
  EnumEquipmentSlot,
  EnumMaterialId,
  findMaterial,
  findSetPieceTemplate,
} from './equipment-data'
import { EXPEDITION_DROP_ITEMS } from './idle-data'

const NOW = new Date('2026-01-01T03:00:00Z')
const standard = findCraftRecipe('bulwark:weapon')!
const flagship = findCraftRecipe('evergreen:armor')!

describe('craft recipes', () => {
  it('has a recipe for every craft set and slot, each pointing at a real set piece', () => {
    expect(CRAFT_RECIPES).toHaveLength(48)
    expect(new Set(CRAFT_RECIPES.map(recipe => recipe.id)).size).toBe(48)
    for (const recipe of CRAFT_RECIPES) {
      expect(recipe.id).toBe(`${recipe.setId}:${recipe.slot}`)
      expect(findSetPieceTemplate(recipe.setId, recipe.slot)?.id).toBe(recipe.templateId)
    }
    expect(CRAFT_SETS.filter(set => set.flagship).map(set => set.id)).toEqual([
      'evergreen',
      'executioner',
      'tempest_binder',
    ])
  })

  it('prices a standard recipe at epic with 3 essences and a core, a flagship with a unique', () => {
    expect(standard).toMatchObject({
      coin: 300,
      minutes: 30,
      baseGrade: EnumEquipmentGrade.EPIC,
      maxGrade: EnumEquipmentGrade.LEGENDARY,
      step: 'epic_legendary',
    })
    expect(standard.materials).toEqual([
      { itemId: CRAFT_ESSENCE_ID.earth, qty: 3 },
      { itemId: 'craft_rune_shard', qty: 1 },
    ])
    expect(flagship).toMatchObject({
      coin: 800,
      minutes: 240,
      baseGrade: EnumEquipmentGrade.LEGENDARY,
      maxGrade: EnumEquipmentGrade.MYTHIC,
      step: 'legendary_mythic',
    })
    expect(flagship.materials).toEqual([
      { itemId: CRAFT_ESSENCE_ID.leaf, qty: 4 },
      { itemId: 'craft_rune_shard', qty: 2 },
      { itemId: CRAFT_UNIQUE_ID.verdant_heart, qty: 1 },
    ])
    expect(CRAFT_TIERS.flagship.minutes).toBe(240)
  })

  it('only flagship recipes need a unique, and an unknown recipe is not found', () => {
    for (const recipe of CRAFT_RECIPES) {
      const unique = recipe.materials.some(m => Object.values(CRAFT_UNIQUE_ID).includes(m.itemId))
      expect(unique).toBe(recipe.flagship)
    }
    expect(findCraftRecipe('bulwark:wing')).toBeUndefined()
    expect(findCraftRecipe('')).toBeUndefined()
  })

  it('adds one Catalyst to the needs only when asked', () => {
    expect(recipeNeeds(standard, false)).toEqual(standard.materials)
    expect(recipeNeeds(standard, true).at(-1)).toEqual({ itemId: CRAFT_CATALYST_ID, qty: 1 })
  })
})

describe('craft materials', () => {
  it('has the same 12 ids in EnumMaterialId and the material list, none for sale', () => {
    const enumIds = Object.values(EnumMaterialId).filter(id => id.startsWith('craft_'))
    expect(CRAFT_MATERIAL_DEFS.map(def => def.id).sort()).toEqual([...enumIds].sort())
    expect(enumIds).toHaveLength(12)
    for (const id of enumIds) {
      expect(findMaterial(id)?.sellable).toBe(false)
    }
    expect(findMaterial(EnumMaterialId.ENHANCE_STONE)?.sellable).toBe(true)
  })

  it('uses only known materials in every recipe', () => {
    for (const recipe of CRAFT_RECIPES) {
      for (const material of recipe.materials) {
        expect(findMaterial(material.itemId)).toBeDefined()
      }
    }
  })
})

describe('skip price and timer', () => {
  const started = NOW
  const finish = craftFinishAt(standard, started)

  it('finishes `minutes` after the start', () => {
    expect(finish.getTime() - started.getTime()).toBe(30 * 60_000)
  })

  it('charges ceil(2 x coin x left / total), and nothing once done', () => {
    expect(calcCraftSkipCoin(standard, finish, started)).toBe(600)
    const half = new Date(started.getTime() + 15 * 60_000)
    expect(calcCraftSkipCoin(standard, finish, half)).toBe(300)
    // 1 ms left still rounds up to 1 coin, never 0.
    expect(calcCraftSkipCoin(standard, finish, new Date(finish.getTime() - 1))).toBe(1)
    expect(calcCraftSkipCoin(standard, finish, finish)).toBe(0)
    expect(calcCraftSkipCoin(standard, finish, new Date(finish.getTime() + 60_000))).toBe(0)
  })

  it('never charges more than the full price, even if the clock is before the start', () => {
    expect(calcCraftSkipCoin(standard, finish, new Date(started.getTime() - 3_600_000))).toBe(600)
  })
})

describe('grade roll and pity', () => {
  it('gives the base grade without a Catalyst and leaves the pity counter alone', () => {
    expect(rollCraftGrade(standard, false, 5, 0)).toEqual({
      grade: EnumEquipmentGrade.EPIC,
      upgraded: false,
      fails: null,
    })
  })

  it('upgrades below the Catalyst chance and counts a failure above it', () => {
    expect(rollCraftGrade(standard, true, 2, CRAFT_CATALYST_CHANCE - 0.001)).toEqual({
      grade: EnumEquipmentGrade.LEGENDARY,
      upgraded: true,
      fails: 0,
    })
    expect(rollCraftGrade(standard, true, 2, CRAFT_CATALYST_CHANCE)).toEqual({
      grade: EnumEquipmentGrade.EPIC,
      upgraded: false,
      fails: 3,
    })
    expect(rollCraftGrade(flagship, true, 0, 0).grade).toBe(EnumEquipmentGrade.MYTHIC)
  })

  it('guarantees the 9th try after 8 failures in a row, whatever the roll', () => {
    let fails = 0
    for (let attempt = 1; attempt <= CRAFT_PITY_AFTER_FAILS; attempt++) {
      const result = rollCraftGrade(flagship, true, fails, 0.999)
      expect(result.upgraded).toBe(false)
      fails = result.fails!
    }
    expect(fails).toBe(CRAFT_PITY_AFTER_FAILS)
    expect(rollCraftGrade(flagship, true, fails, 0.999)).toMatchObject({
      upgraded: true,
      grade: EnumEquipmentGrade.MYTHIC,
      fails: 0,
    })
  })

  it('upgrades about 15% of the time over many rolls', () => {
    let wins = 0
    for (let index = 0; index < 10_000; index++) {
      wins += rollCraftGrade(standard, true, 0, index / 10_000).upgraded ? 1 : 0
    }
    expect(wins / 10_000).toBeCloseTo(CRAFT_CATALYST_CHANCE, 2)
  })
})

describe('drops', () => {
  it('rolls an essence of the area element at the set chance, and nothing above it', () => {
    const dice = (...values: number[]) => {
      let index = 0
      return () => values[index++]
    }
    expect(rollAdventureEssence('volcano', dice(CRAFT_ADVENTURE_ESSENCE.chance))).toBeNull()
    expect(rollAdventureEssence('volcano', dice(0, 0))).toEqual({
      itemId: CRAFT_ESSENCE_ID.flame,
      qty: 1,
    })
    expect(rollAdventureEssence('coast', dice(0, 0.99))).toEqual({
      itemId: CRAFT_ESSENCE_ID.tide,
      qty: 2,
    })
    // An area with no element (the meadow) picks one of the six with a third die.
    expect(rollAdventureEssence('meadow', dice(0, 0, 0.99))?.itemId).toBe(CRAFT_ESSENCE_ID.holy)
    for (const area of ADVENTURE_AREAS) {
      expect(rollAdventureEssence(area.id, dice(0, 0, 0))).not.toBeNull()
    }
  })

  it('pays raid cores by difficulty: a forge core first, then rune shards alternate', () => {
    expect(raidCoreDrops('normal')).toEqual([{ itemId: 'craft_forge_core', qty: 1 }])
    expect(raidCoreDrops('hard')).toEqual([
      { itemId: 'craft_forge_core', qty: 1 },
      { itemId: 'craft_rune_shard', qty: 1 },
    ])
    expect(raidCoreDrops('nightmare')).toEqual([
      { itemId: 'craft_forge_core', qty: 2 },
      { itemId: 'craft_rune_shard', qty: 1 },
    ])
    expect(raidCoreDrops('unknown')).toEqual([])
  })

  it('pays the world boss unique (kind from the roll) and a Catalyst, more for ranks 1-3', () => {
    const [unique, catalyst] = worldBossCraftDrops(10, 0)
    expect(unique).toEqual({ itemId: CRAFT_UNIQUE_ID.verdant_heart, qty: 1 })
    expect(catalyst).toEqual({ itemId: CRAFT_CATALYST_ID, qty: 1 })
    expect(worldBossCraftDrops(3, 0.99)).toEqual([
      { itemId: CRAFT_UNIQUE_ID.storm_sigil, qty: 2 },
      { itemId: CRAFT_CATALYST_ID, qty: 2 },
    ])
    expect(worldBossCraftDrops(4, 0.5)[0].itemId).toBe(CRAFT_UNIQUE_ID.reaper_edge)
  })

  it('adds the six essences to the expedition drops', () => {
    for (const id of Object.values(CRAFT_ESSENCE_ID)) {
      expect(EXPEDITION_DROP_ITEMS).toContain(id)
    }
    expect(EXPEDITION_DROP_ITEMS).toHaveLength(8)
    expect(Object.values(EnumEquipmentSlot)).toHaveLength(4)
  })
})
