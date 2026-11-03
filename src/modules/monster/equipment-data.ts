import { EnumMonsterStage } from '../../db/entities/monster.entity'
import type { IFighterEffects } from './battle-stats'
import {
  SET_ENHANCE_MULTIPLIER,
  SET_ENHANCE_THRESHOLD,
  SET_PIECE_MAIN_MULTIPLIER,
} from './monster-rules'
import { IBattleStats, isStageAtLeast } from './species-data'

// Equipment is data-driven: add a template (or a set) here and it works everywhere.

export enum EnumEquipmentSlot {
  WEAPON = 'weapon',
  ARMOR = 'armor',
  HELMET = 'helmet',
  ACCESSORY = 'accessory',
}

export enum EnumEquipmentGrade {
  COMMON = 'common',
  RARE = 'rare',
  EPIC = 'epic',
  LEGENDARY = 'legendary',
}

export enum EnumMaterialId {
  ENHANCE_STONE = 'enhance_stone',
  PROTECT_SCROLL = 'protect_scroll',
}

export type StatKey = keyof IBattleStats
export const STAT_KEYS: StatKey[] = ['hp', 'atk', 'def', 'spd']

// What each slot's main stat is, and its base value at common grade.
export const SLOT_MAIN_STAT: Record<EnumEquipmentSlot, { stat: StatKey; base: number }> = {
  [EnumEquipmentSlot.WEAPON]: { stat: 'atk', base: 4 },
  [EnumEquipmentSlot.ARMOR]: { stat: 'def', base: 3 },
  [EnumEquipmentSlot.HELMET]: { stat: 'hp', base: 15 },
  [EnumEquipmentSlot.ACCESSORY]: { stat: 'spd', base: 2 },
}

export const GRADE_MULTIPLIER: Record<EnumEquipmentGrade, number> = {
  [EnumEquipmentGrade.COMMON]: 1,
  [EnumEquipmentGrade.RARE]: 1.5,
  [EnumEquipmentGrade.EPIC]: 2.2,
  [EnumEquipmentGrade.LEGENDARY]: 3,
}

// Secondary stats roll distinct stats at 50%-100% of base x grade multiplier; higher grades roll more.
export const SUB_STAT_BASE: Record<StatKey, number> = { hp: 6, atk: 2, def: 1.5, spd: 1 }
export const SUB_STAT_COUNT_BY_GRADE: Record<EnumEquipmentGrade, { min: number; max: number }> = {
  [EnumEquipmentGrade.COMMON]: { min: 0, max: 1 },
  [EnumEquipmentGrade.RARE]: { min: 1, max: 2 },
  [EnumEquipmentGrade.EPIC]: { min: 2, max: 3 },
  [EnumEquipmentGrade.LEGENDARY]: { min: 3, max: 4 },
}
export const SUB_STAT_ROLL = { min: 0.5, max: 1 }

// The youngest form that may wear a piece of each grade (null = any form, even an egg).
export const MIN_STAGE_BY_GRADE: Record<EnumEquipmentGrade, EnumMonsterStage | null> = {
  [EnumEquipmentGrade.COMMON]: null,
  [EnumEquipmentGrade.RARE]: EnumMonsterStage.ADULT,
  [EnumEquipmentGrade.EPIC]: EnumMonsterStage.PERFECT,
  [EnumEquipmentGrade.LEGENDARY]: EnumMonsterStage.PERFECT,
}

// Checked wherever a piece is put on. Pieces already worn are never re-checked (grandfathered).
export const canEquip = (stage: EnumMonsterStage, grade: EnumEquipmentGrade) => {
  const minimum = MIN_STAGE_BY_GRADE[grade]
  return minimum === null || isStageAtLeast(stage, minimum)
}

// Special options: care perks for the pet wearing the piece (not battle stats). Every piece rolls them, set pieces too.
export type SpecialKey = 'slowHunger' | 'staminaSaver' | 'treasureNose' | 'tidyPet'
export interface ISpecialOption {
  key: SpecialKey
  // Percent, e.g. 10 = 10%.
  value: number
}
// `min`-`max` is the base range; a grade rolls `lo`-`hi` of the way along it.
export const SPECIAL_DEFINITIONS: Record<SpecialKey, { min: number; max: number }> = {
  slowHunger: { min: 5, max: 15 },
  staminaSaver: { min: 5, max: 15 },
  treasureNose: { min: 5, max: 15 },
  tidyPet: { min: 10, max: 25 },
}
export const SPECIAL_KEYS = Object.keys(SPECIAL_DEFINITIONS) as SpecialKey[]
export const SPECIAL_BY_GRADE: Record<
  EnumEquipmentGrade,
  { chance: number; secondChance: number; lo: number; hi: number }
> = {
  [EnumEquipmentGrade.COMMON]: { chance: 0, secondChance: 0, lo: 0, hi: 0 },
  [EnumEquipmentGrade.RARE]: { chance: 0.15, secondChance: 0, lo: 0.5, hi: 0.7 },
  [EnumEquipmentGrade.EPIC]: { chance: 0.5, secondChance: 0, lo: 0.7, hi: 0.9 },
  [EnumEquipmentGrade.LEGENDARY]: { chance: 1, secondChance: 0.25, lo: 0.9, hi: 1 },
}
// Worn pieces add up, but one option never passes this many times its base maximum.
export const SPECIAL_TOTAL_CAP_MULTIPLIER = 2

export const rollSpecialOptions = (
  grade: EnumEquipmentGrade,
  rand: () => number
): ISpecialOption[] => {
  const rule = SPECIAL_BY_GRADE[grade]
  if (rand() >= rule.chance) {
    return []
  }
  const count = rand() < rule.secondChance ? 2 : 1
  const pool = [...SPECIAL_KEYS]
  const options: ISpecialOption[] = []
  for (let index = 0; index < count; index++) {
    const key = pool.splice(Math.floor(rand() * pool.length), 1)[0]
    const { min, max } = SPECIAL_DEFINITIONS[key]
    options.push({
      key,
      value: Math.round(min + (max - min) * (rule.lo + rand() * (rule.hi - rule.lo))),
    })
  }
  return options
}

export interface ISpecialBonus {
  // Multipliers on the base rate (1 = unchanged).
  hungerDrainMultiplier: number
  staminaCostMultiplier: number
  poopRateMultiplier: number
  dropMultiplier: number
}

// Pure: what a pet's worn pieces give. Recomputed on every use, never stored.
export const calcSpecialBonuses = (
  items: { specialOptions?: ISpecialOption[] }[]
): ISpecialBonus => {
  const total: Record<SpecialKey, number> = {
    slowHunger: 0,
    staminaSaver: 0,
    treasureNose: 0,
    tidyPet: 0,
  }
  for (const item of items) {
    for (const option of item.specialOptions ?? []) {
      if (option.key in total) {
        total[option.key] += option.value
      }
    }
  }
  const capped = (key: SpecialKey) =>
    Math.min(total[key], SPECIAL_DEFINITIONS[key].max * SPECIAL_TOTAL_CAP_MULTIPLIER) / 100
  return {
    hungerDrainMultiplier: 1 - capped('slowHunger'),
    staminaCostMultiplier: 1 - capped('staminaSaver'),
    poopRateMultiplier: 1 - capped('tidyPet'),
    dropMultiplier: 1 + capped('treasureNose'),
  }
}

export interface IEquipmentTemplate {
  id: string
  name: string
  emoji: string
  slot: EnumEquipmentSlot
  // Set pieces share a setId; plain items have null.
  setId: string | null
}

const setPieces = (
  setId: string,
  prefix: string,
  emoji: string,
  names: Record<EnumEquipmentSlot, string>
): IEquipmentTemplate[] =>
  Object.values(EnumEquipmentSlot).map(slot => ({
    id: `${setId}_${slot}`,
    name: `${names[slot]}${prefix}`,
    emoji,
    slot,
    setId,
  }))

const SET_PIECE_NAMES: Record<EnumEquipmentSlot, string> = {
  [EnumEquipmentSlot.WEAPON]: 'อาวุธ',
  [EnumEquipmentSlot.ARMOR]: 'เกราะ',
  [EnumEquipmentSlot.HELMET]: 'หมวก',
  [EnumEquipmentSlot.ACCESSORY]: 'เครื่องประดับ',
}

export const EQUIPMENT_TEMPLATES: IEquipmentTemplate[] = [
  { id: 'wooden_sword', name: 'ดาบไม้', emoji: '🗡️', slot: EnumEquipmentSlot.WEAPON, setId: null },
  { id: 'iron_axe', name: 'ขวานเหล็ก', emoji: '🪓', slot: EnumEquipmentSlot.WEAPON, setId: null },
  {
    id: 'leather_vest',
    name: 'เสื้อหนัง',
    emoji: '🥋',
    slot: EnumEquipmentSlot.ARMOR,
    setId: null,
  },
  { id: 'iron_armor', name: 'เกราะเหล็ก', emoji: '🛡️', slot: EnumEquipmentSlot.ARMOR, setId: null },
  { id: 'cloth_cap', name: 'หมวกผ้า', emoji: '🧢', slot: EnumEquipmentSlot.HELMET, setId: null },
  { id: 'iron_helm', name: 'หมวกเหล็ก', emoji: '⛑️', slot: EnumEquipmentSlot.HELMET, setId: null },
  {
    id: 'copper_ring',
    name: 'แหวนทองแดง',
    emoji: '💍',
    slot: EnumEquipmentSlot.ACCESSORY,
    setId: null,
  },
  {
    id: 'stone_necklace',
    name: 'สร้อยหิน',
    emoji: '📿',
    slot: EnumEquipmentSlot.ACCESSORY,
    setId: null,
  },
  ...setPieces('blazing', 'เพลิงกัลป์', '🔥', SET_PIECE_NAMES),
  ...setPieces('tidal_guard', 'วารีพิทักษ์', '💧', SET_PIECE_NAMES),
  ...setPieces('deep_root', 'รากแก้ว', '🌿', SET_PIECE_NAMES),
  ...setPieces('swift_thunder', 'สายฟ้าเร็ว', '⚡', SET_PIECE_NAMES),
  ...setPieces('radiant', 'รัศมีสวรรค์', '✨', SET_PIECE_NAMES),
  ...setPieces('nightfall', 'ราตรีทมิฬ', '🌑', SET_PIECE_NAMES),
  ...setPieces('shadow_veil', 'ม่านเงา', '🌫️', SET_PIECE_NAMES),
]

export const findEquipmentTemplate = (templateId: string) =>
  EQUIPMENT_TEMPLATES.find(template => template.id === templateId)

// Grade odds (percent, summing to 100) for each way of getting a plain piece.
export const BOX_GRADE_RATES: Partial<Record<EnumEquipmentGrade, number>> = {
  [EnumEquipmentGrade.COMMON]: 70,
  [EnumEquipmentGrade.RARE]: 25,
  [EnumEquipmentGrade.EPIC]: 5,
}

export const DROP_GRADE_RATES_BY_AREA: Record<
  string,
  Partial<Record<EnumEquipmentGrade, number>>
> = {
  meadow: { [EnumEquipmentGrade.COMMON]: 100 },
  coast: { [EnumEquipmentGrade.COMMON]: 80, [EnumEquipmentGrade.RARE]: 20 },
  volcano: { [EnumEquipmentGrade.RARE]: 80, [EnumEquipmentGrade.EPIC]: 20 },
  cavern: { [EnumEquipmentGrade.RARE]: 50, [EnumEquipmentGrade.EPIC]: 50 },
  storm_peak: { [EnumEquipmentGrade.EPIC]: 100 },
}

// Stones for dismantling a piece, by grade; each two enhance levels add one more.
export const DISMANTLE_STONES: Record<EnumEquipmentGrade, number> = {
  [EnumEquipmentGrade.COMMON]: 1,
  [EnumEquipmentGrade.RARE]: 3,
  [EnumEquipmentGrade.EPIC]: 8,
  [EnumEquipmentGrade.LEGENDARY]: 20,
}

export interface IMaterial {
  id: EnumMaterialId
  name: string
  emoji: string
  description: string
  price: number
  currency: 'coin' | 'gem' | 'raid_token'
}

export const MATERIALS: IMaterial[] = [
  {
    id: EnumMaterialId.ENHANCE_STONE,
    name: 'หินตีบวก',
    emoji: '🪨',
    description: 'วัตถุดิบตีบวกอุปกรณ์',
    price: 40,
    currency: 'coin',
  },
  {
    id: EnumMaterialId.PROTECT_SCROLL,
    name: 'ใบกันแตก',
    emoji: '📜',
    description: 'ตีบวก +10 ขึ้นไปล้มเหลวแล้วไม่ลดระดับและไม่แตก',
    price: 6,
    currency: 'raid_token',
  },
]

export const findMaterial = (materialId: string) =>
  MATERIALS.find(material => (material.id as string) === materialId)

// Set bonuses: percent boosts to the monster's stats plus special battle effects. Pieces from
// different sets mix: every set with 2+ pieces worn gives its 2-piece bonus, 4 pieces give both.
export interface ISetBonus {
  pieces: 2 | 4
  // Percent boosts (0.15 = +15%) to the monster's stats.
  pct?: Partial<IBattleStats>
  // Special battle effect (see IFighterEffects).
  effect?: IFighterEffects
}

export interface ISetDefinition {
  name: string
  bonuses: ISetBonus[]
}

// Boss sets: pieces drop from the boss named in raid-data.ts.
export const SET_DEFINITIONS: Record<string, ISetDefinition> = {
  blazing: {
    name: 'ชุดเพลิงกัลป์',
    bonuses: [
      { pieces: 2, pct: { atk: 0.15 } },
      { pieces: 4, effect: { burnTurns: 3 } },
    ],
  },
  tidal_guard: {
    name: 'ชุดวารีพิทักษ์',
    bonuses: [
      { pieces: 2, pct: { def: 0.2 } },
      { pieces: 4, effect: { shieldPct: 0.15 } },
    ],
  },
  deep_root: {
    name: 'ชุดรากแก้ว',
    bonuses: [
      { pieces: 2, pct: { hp: 0.2 } },
      { pieces: 4, effect: { regenPct: 0.05 } },
    ],
  },
  swift_thunder: {
    name: 'ชุดสายฟ้าเร็ว',
    bonuses: [
      { pieces: 2, pct: { spd: 0.15 } },
      { pieces: 4, effect: { doubleStrikeChance: 0.2 } },
    ],
  },
  radiant: {
    name: 'ชุดรัศมีสวรรค์',
    bonuses: [
      { pieces: 2, pct: { hp: 0.15 } },
      { pieces: 4, effect: { shieldPct: 0.1, regenPct: 0.02 } },
    ],
  },
  nightfall: {
    name: 'ชุดราตรีทมิฬ',
    bonuses: [
      { pieces: 2, pct: { atk: 0.2 } },
      { pieces: 4, effect: { critChance: 0.1, critDamage: 0.2 } },
    ],
  },
  shadow_veil: {
    name: 'ชุดม่านเงา',
    bonuses: [
      { pieces: 2, pct: { spd: 0.15 } },
      { pieces: 4, effect: { evasion: 0.1 } },
    ],
  },
}

export interface IEquipmentItem {
  templateId: string
  slot: EnumEquipmentSlot
  setId: string | null
  grade: EnumEquipmentGrade
  mainValue: number
  subStats: Partial<Record<StatKey, number>>
  specialOptions?: ISpecialOption[]
  enhanceLevel: number
}

// Enhancing raises the main stat only: +5% per level, plus +5% more at +5, +10 and +15.
export const ENHANCE_BONUS_PER_LEVEL = 0.05
export const ENHANCE_MILESTONE_BONUS = 0.05
export const ENHANCE_MILESTONE_EVERY = 5

export const enhanceMultiplier = (level: number) =>
  1 +
  ENHANCE_BONUS_PER_LEVEL * level +
  ENHANCE_MILESTONE_BONUS * Math.floor(level / ENHANCE_MILESTONE_EVERY)

export const mainValueAt = (mainValue: number, level: number) =>
  Math.round(mainValue * enhanceMultiplier(level))

// Flat stats one piece adds (main stat at its enhance level, plus secondary stats).
export const getItemStats = (item: IEquipmentItem): IBattleStats => {
  const stats: IBattleStats = { hp: 0, atk: 0, def: 0, spd: 0 }
  stats[SLOT_MAIN_STAT[item.slot].stat] += mainValueAt(item.mainValue, item.enhanceLevel)
  for (const key of STAT_KEYS) {
    stats[key] += item.subStats[key] ?? 0
  }
  return stats
}

export interface IEquipmentBonus {
  flat: IBattleStats
  // Fractions: 0.15 = +15%.
  pct: IBattleStats
  effects: IFighterEffects
}

export const NO_EQUIPMENT_BONUS: IEquipmentBonus = {
  flat: { hp: 0, atk: 0, def: 0, spd: 0 },
  pct: { hp: 0, atk: 0, def: 0, spd: 0 },
  effects: {},
}

export interface IActiveSet {
  setId: string
  name: string
  pieces: number
  bonuses: ISetDefinition['bonuses']
  // Every worn piece of the set is at SET_ENHANCE_THRESHOLD or more: percent bonuses are boosted.
  isEnhanced: boolean
}

export const calcSetBonuses = (
  items: IEquipmentItem[],
  definitions: Record<string, ISetDefinition> = SET_DEFINITIONS
): IActiveSet[] => {
  const worn = new Map<string, IEquipmentItem[]>()
  for (const item of items) {
    if (item.setId) {
      worn.set(item.setId, [...(worn.get(item.setId) ?? []), item])
    }
  }
  const active: IActiveSet[] = []
  for (const [setId, pieces] of worn) {
    const definition = definitions[setId]
    const bonuses = definition?.bonuses.filter(bonus => pieces.length >= bonus.pieces) ?? []
    if (definition && bonuses.length) {
      active.push({
        setId,
        name: definition.name,
        pieces: pieces.length,
        bonuses,
        isEnhanced: pieces.every(piece => piece.enhanceLevel >= SET_ENHANCE_THRESHOLD),
      })
    }
  }
  return active
}

// Every set with how many of its pieces are worn, so a screen can show 'worn/full' and which
// bonus tiers are on. `pieceCount` is the full set (its largest tier); `isEnhanced` means every
// worn piece is at SET_ENHANCE_THRESHOLD or more (percent bonuses are multiplied).
export const calcSetProgress = (
  items: IEquipmentItem[],
  definitions: Record<string, ISetDefinition> = SET_DEFINITIONS
) =>
  Object.entries(definitions).map(([setId, definition]) => {
    const worn = items.filter(item => item.setId === setId)
    return {
      setId,
      name: definition.name,
      pieceCount: Math.max(...definition.bonuses.map(bonus => bonus.pieces)),
      worn: worn.length,
      isEnhanced:
        worn.length > 0 && worn.every(piece => piece.enhanceLevel >= SET_ENHANCE_THRESHOLD),
      tiers: definition.bonuses.map(bonus => ({
        pieces: bonus.pieces,
        pct: bonus.pct ?? null,
        effect: bonus.effect ?? null,
      })),
    }
  })

// Chances and turn counts take the best value; shields and regeneration add up.
const mergeEffects = (into: IFighterEffects, effect: IFighterEffects) => {
  if (effect.burnTurns) {
    into.burnTurns = Math.max(into.burnTurns ?? 0, effect.burnTurns)
  }
  if (effect.doubleStrikeChance) {
    into.doubleStrikeChance = Math.max(into.doubleStrikeChance ?? 0, effect.doubleStrikeChance)
  }
  if (effect.shieldPct) {
    into.shieldPct = (into.shieldPct ?? 0) + effect.shieldPct
  }
  if (effect.regenPct) {
    into.regenPct = (into.regenPct ?? 0) + effect.regenPct
  }
  // Crit and evasion add up (capped later, where the fighter is built).
  for (const key of ['critChance', 'critDamage', 'evasion'] as const) {
    if (effect[key]) {
      into[key] = (into[key] ?? 0) + effect[key]
    }
  }
}

export const calcEquipmentBonus = (
  items: IEquipmentItem[],
  definitions: Record<string, ISetDefinition> = SET_DEFINITIONS
): IEquipmentBonus => {
  const bonus: IEquipmentBonus = {
    flat: { ...NO_EQUIPMENT_BONUS.flat },
    pct: { ...NO_EQUIPMENT_BONUS.pct },
    effects: {},
  }
  for (const item of items) {
    const stats = getItemStats(item)
    for (const key of STAT_KEYS) {
      bonus.flat[key] += stats[key]
    }
  }
  for (const set of calcSetBonuses(items, definitions)) {
    const scale = set.isEnhanced ? SET_ENHANCE_MULTIPLIER : 1
    for (const setBonus of set.bonuses) {
      for (const key of STAT_KEYS) {
        bonus.pct[key] += (setBonus.pct?.[key] ?? 0) * scale
      }
      if (setBonus.effect) {
        mergeEffects(bonus.effects, setBonus.effect)
      }
    }
  }
  return bonus
}

// Picks a grade from percent odds with a roll in [0, 1).
export const rollGrade = (
  rates: Partial<Record<EnumEquipmentGrade, number>>,
  roll: number
): EnumEquipmentGrade => {
  const entries = Object.entries(rates) as [EnumEquipmentGrade, number][]
  const total = entries.reduce((sum, [, rate]) => sum + rate, 0)
  let cursor = roll * total
  for (const [grade, rate] of entries) {
    if (cursor < rate) {
      return grade
    }
    cursor -= rate
  }
  return entries[entries.length - 1][0]
}

// Rolls a new plain piece. `rand` returns [0, 1) so tests can seed it.
// Random secondary stats and special options, shared by plain and set pieces.
const rollRandomStats = (grade: EnumEquipmentGrade, rand: () => number) => {
  const multiplier = GRADE_MULTIPLIER[grade]
  const count = SUB_STAT_COUNT_BY_GRADE[grade]
  const subCount = count.min + Math.floor(rand() * (count.max - count.min + 1))
  const pool = [...STAT_KEYS]
  const subStats: Partial<Record<StatKey, number>> = {}
  for (let index = 0; index < subCount; index++) {
    const key = pool.splice(Math.floor(rand() * pool.length), 1)[0]
    const factor = SUB_STAT_ROLL.min + rand() * (SUB_STAT_ROLL.max - SUB_STAT_ROLL.min)
    subStats[key] = Math.max(1, Math.round(SUB_STAT_BASE[key] * multiplier * factor))
  }
  return { subStats, specialOptions: rollSpecialOptions(grade, rand) }
}

export const rollEquipment = (
  grade: EnumEquipmentGrade,
  rand: () => number,
  templates: IEquipmentTemplate[] = EQUIPMENT_TEMPLATES
): IEquipmentItem => {
  const plain = templates.filter(template => template.setId === null)
  const template = plain[Math.floor(rand() * plain.length)]
  return {
    templateId: template.id,
    slot: template.slot,
    setId: template.setId,
    grade,
    mainValue: Math.round(SLOT_MAIN_STAT[template.slot].base * GRADE_MULTIPLIER[grade]),
    ...rollRandomStats(grade, rand),
    enhanceLevel: 0,
  }
}

// A set piece of the given grade: main stat boosted over plain pieces, other stats rolled.
export const buildSetPiece = (
  templateId: string,
  grade: EnumEquipmentGrade,
  rand: () => number
): IEquipmentItem => {
  const template = findEquipmentTemplate(templateId)
  if (!template?.setId) {
    throw new Error(`Not a set piece: ${templateId}`)
  }
  return {
    templateId: template.id,
    slot: template.slot,
    setId: template.setId,
    grade,
    mainValue: Math.round(
      SLOT_MAIN_STAT[template.slot].base * GRADE_MULTIPLIER[grade] * SET_PIECE_MAIN_MULTIPLIER
    ),
    ...rollRandomStats(grade, rand),
    enhanceLevel: 0,
  }
}

export const findSetPieceTemplate = (setId: string, slot: EnumEquipmentSlot) =>
  EQUIPMENT_TEMPLATES.find(template => template.setId === setId && template.slot === slot)
