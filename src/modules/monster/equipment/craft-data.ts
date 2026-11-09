import {
  CRAFT_CATALYST_ID,
  CRAFT_ESSENCE_ID,
  CRAFT_RARE_ID,
  CRAFT_UNIQUE_ID,
} from './craft-materials'
import { CRAFT_SETS, CraftEssence, ICraftSet } from './craft-sets'
import { EnumEquipmentGrade, EnumEquipmentSlot, findEquipmentTemplate } from './equipment-data'

// Craft rules (docs/tamagotchi/craft.md): recipes, prices, timers, Catalyst odds and pity. Pure:
// the service passes the clock and the dice in, so every rule here is testable without either.

export type CraftStep = 'epic_legendary' | 'legendary_mythic'

export const CRAFT_TIERS = {
  standard: {
    coin: 300,
    minutes: 30,
    baseGrade: EnumEquipmentGrade.EPIC,
    maxGrade: EnumEquipmentGrade.LEGENDARY,
    step: 'epic_legendary' as CraftStep,
  },
  flagship: {
    coin: 800,
    minutes: 240,
    baseGrade: EnumEquipmentGrade.LEGENDARY,
    maxGrade: EnumEquipmentGrade.MYTHIC,
    step: 'legendary_mythic' as CraftStep,
  },
}
export const CRAFT_STEPS: CraftStep[] = ['epic_legendary', 'legendary_mythic']

// A Catalyst upgrades the grade by one step with this chance.
export const CRAFT_CATALYST_CHANCE = 0.15
// This many failures in a row (per player and step): the next Catalyst try always succeeds.
export const CRAFT_PITY_AFTER_FAILS = 8

// Adventure wins: chance and amount of an essence matching the area's element.
export const CRAFT_ADVENTURE_ESSENCE = { chance: 0.06, min: 1, max: 2 }
// Raid wins: cores per difficulty (the first is a forge core, the rest alternate with rune shards).
export const CRAFT_RAID_CORES: Record<string, number> = { normal: 1, hard: 2, nightmare: 3 }
// World Boss weekly claim: everyone gets these, ranks 1-3 get the top-rank amount.
export const CRAFT_WORLD_BOSS = { unique: 1, catalyst: 1, topRank: 3, topUnique: 1, topCatalyst: 1 }

const MATERIAL_ROLE = { standard: [3, 1, 0], flagship: [4, 2, 1] } as const

export interface ICraftMaterialNeed {
  itemId: string
  qty: number
}

export interface ICraftRecipe {
  id: string
  setId: string
  slot: EnumEquipmentSlot
  templateId: string
  flagship: boolean
  baseGrade: EnumEquipmentGrade
  maxGrade: EnumEquipmentGrade
  step: CraftStep
  coin: number
  minutes: number
  materials: ICraftMaterialNeed[]
}

export const craftRecipeId = (setId: string, slot: string) => `${setId}:${slot}`

const materialsOf = (set: ICraftSet): ICraftMaterialNeed[] => {
  const [essence, rare, unique] = MATERIAL_ROLE[set.flagship ? 'flagship' : 'standard']
  return [
    { itemId: CRAFT_ESSENCE_ID[set.essence], qty: essence },
    { itemId: CRAFT_RARE_ID[set.rare], qty: rare },
    ...(unique && set.unique ? [{ itemId: CRAFT_UNIQUE_ID[set.unique], qty: unique }] : []),
  ]
}

const recipeOf = (set: ICraftSet, slot: EnumEquipmentSlot): ICraftRecipe => {
  const tier = CRAFT_TIERS[set.flagship ? 'flagship' : 'standard']
  return {
    id: craftRecipeId(set.id, slot),
    setId: set.id,
    slot,
    templateId: `${set.id}_${slot}`,
    flagship: set.flagship,
    baseGrade: tier.baseGrade,
    maxGrade: tier.maxGrade,
    step: tier.step,
    coin: tier.coin,
    minutes: tier.minutes,
    materials: materialsOf(set),
  }
}

// 48 recipes: every craft set x every slot.
export const CRAFT_RECIPES: ICraftRecipe[] = CRAFT_SETS.flatMap(set =>
  Object.values(EnumEquipmentSlot).map(slot => recipeOf(set, slot))
)

const RECIPE_BY_ID = new Map(CRAFT_RECIPES.map(recipe => [recipe.id, recipe]))
export const findCraftRecipe = (recipeId: string) => RECIPE_BY_ID.get(recipeId)

// Every material a recipe takes (Catalyst excluded): what start() has to find in the bag.
export const recipeNeeds = (recipe: ICraftRecipe, useCatalyst: boolean): ICraftMaterialNeed[] => [
  ...recipe.materials,
  ...(useCatalyst ? [{ itemId: CRAFT_CATALYST_ID, qty: 1 }] : []),
]

const MINUTE_MS = 60_000

export const craftFinishAt = (recipe: ICraftRecipe, startedAt: Date) =>
  new Date(startedAt.getTime() + recipe.minutes * MINUTE_MS)

export interface ICraftGradeResult {
  grade: EnumEquipmentGrade
  upgraded: boolean
  // The pity counter after this claim; null when no Catalyst was used (the counter is untouched).
  fails: number | null
}

// The grade a claim produces. Without a Catalyst: the base grade. With one: 15% to the max grade,
// and the (CRAFT_PITY_AFTER_FAILS + 1)th try in a row always succeeds. `roll` is in [0, 1).
export const rollCraftGrade = (
  recipe: ICraftRecipe,
  useCatalyst: boolean,
  fails: number,
  roll: number
): ICraftGradeResult => {
  if (!useCatalyst) {
    return { grade: recipe.baseGrade, upgraded: false, fails: null }
  }
  const upgraded = fails >= CRAFT_PITY_AFTER_FAILS || roll < CRAFT_CATALYST_CHANCE
  return {
    grade: upgraded ? recipe.maxGrade : recipe.baseGrade,
    upgraded,
    fails: upgraded ? 0 : fails + 1,
  }
}

// Adventure: an essence for the area's element after a win, or null. Two dice: the chance, then
// the amount (and a third for the element of an area that has none: a random one of the six).
export const ESSENCE_ELEMENTS = Object.keys(CRAFT_ESSENCE_ID) as CraftEssence[]
export const CRAFT_AREA_ELEMENT: Record<string, CraftEssence | undefined> = {
  coast: 'tide',
  volcano: 'flame',
  cavern: 'earth',
  storm_peak: 'lightning',
}

export const rollAdventureEssence = (
  areaId: string,
  rand: () => number
): ICraftMaterialNeed | null => {
  if (rand() >= CRAFT_ADVENTURE_ESSENCE.chance) {
    return null
  }
  const span = CRAFT_ADVENTURE_ESSENCE.max - CRAFT_ADVENTURE_ESSENCE.min + 1
  const qty = CRAFT_ADVENTURE_ESSENCE.min + Math.floor(rand() * span)
  const element =
    CRAFT_AREA_ELEMENT[areaId] ?? ESSENCE_ELEMENTS[Math.floor(rand() * ESSENCE_ELEMENTS.length)]
  return { itemId: CRAFT_ESSENCE_ID[element], qty }
}

// Raid win cores: the first is a forge core, the others alternate rune shard / forge core.
export const raidCoreDrops = (difficulty: string): ICraftMaterialNeed[] => {
  const count = CRAFT_RAID_CORES[difficulty] ?? 0
  const drops: Record<string, number> = {}
  for (let index = 0; index < count; index++) {
    const itemId = index % 2 === 0 ? CRAFT_RARE_ID.forge : CRAFT_RARE_ID.rune
    drops[itemId] = (drops[itemId] ?? 0) + 1
  }
  return Object.entries(drops).map(([itemId, qty]) => ({ itemId, qty }))
}

// World Boss weekly claim: one unique of a kind picked by `kindRoll` in [0, 1) (derived from ids so
// a retry cannot re-roll) and one Catalyst, plus another of each for ranks 1-3.
export const worldBossCraftDrops = (rank: number, kindRoll: number): ICraftMaterialNeed[] => {
  const uniques = Object.values(CRAFT_UNIQUE_ID)
  const top = rank <= CRAFT_WORLD_BOSS.topRank
  return [
    {
      itemId: uniques[Math.min(uniques.length - 1, Math.floor(kindRoll * uniques.length))],
      qty: CRAFT_WORLD_BOSS.unique + (top ? CRAFT_WORLD_BOSS.topUnique : 0),
    },
    {
      itemId: CRAFT_CATALYST_ID,
      qty: CRAFT_WORLD_BOSS.catalyst + (top ? CRAFT_WORLD_BOSS.topCatalyst : 0),
    },
  ]
}

// ---- What the craft screen shows (pure: the service passes in what it loaded) ----

export interface ICraftRecipeView {
  id: string
  setId: string
  slot: EnumEquipmentSlot
  name: string
  flagship: boolean
  baseGrade: EnumEquipmentGrade
  maxGrade: EnumEquipmentGrade
  coin: number
  minutes: number
  materials: { itemId: string; qty: number; owned: number }[]
  canStart: boolean
}

export interface ICraftQueueView {
  recipeId: string
  useCatalyst: boolean
  startedAt: string
  finishAt: string
  status: 'running' | 'ready'
}

export interface ICraftOverview {
  recipes: ICraftRecipeView[]
  queue: ICraftQueueView | null
  catalyst: {
    owned: number
    chance: number
    pity: { step: CraftStep; fails: number; guaranteeAfter: number }[]
  }
  coin: number
}

export interface ICraftJobLike {
  recipeId: string
  useCatalyst: boolean
  startedAt: Date
  finishAt: Date
}

export const buildCraftOverview = (input: {
  job: ICraftJobLike | null
  owned: Map<string, number>
  pity: Map<string, number>
  coin: number
  now: Date
}): ICraftOverview => {
  const { job, owned, pity, coin, now } = input
  const have = (itemId: string) => owned.get(itemId) ?? 0
  const recipes = CRAFT_RECIPES.map(recipe => ({
    id: recipe.id,
    setId: recipe.setId,
    slot: recipe.slot,
    name: findEquipmentTemplate(recipe.templateId)?.name ?? recipe.templateId,
    flagship: recipe.flagship,
    baseGrade: recipe.baseGrade,
    maxGrade: recipe.maxGrade,
    coin: recipe.coin,
    minutes: recipe.minutes,
    materials: recipe.materials.map(need => ({ ...need, owned: have(need.itemId) })),
    canStart:
      !job && coin >= recipe.coin && recipe.materials.every(need => have(need.itemId) >= need.qty),
  }))
  const queueRecipe = job && findCraftRecipe(job.recipeId)
  const ready = !!job && job.finishAt.getTime() <= now.getTime()
  return {
    recipes,
    queue:
      job && queueRecipe
        ? {
            recipeId: job.recipeId,
            useCatalyst: job.useCatalyst,
            startedAt: job.startedAt.toISOString(),
            finishAt: job.finishAt.toISOString(),
            status: ready ? 'ready' : 'running',
          }
        : null,
    catalyst: {
      owned: have(CRAFT_CATALYST_ID),
      chance: CRAFT_CATALYST_CHANCE,
      pity: CRAFT_STEPS.map(step => ({
        step,
        fails: pity.get(step) ?? 0,
        guaranteeAfter: CRAFT_PITY_AFTER_FAILS,
      })),
    },
    coin,
  }
}
