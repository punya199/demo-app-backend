import { IBattleStats } from './species-data'

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

// Secondary stats roll 1-3 distinct stats at 50%-100% of base x grade multiplier.
export const SUB_STAT_BASE: Record<StatKey, number> = { hp: 6, atk: 2, def: 1.5, spd: 1 }
export const SUB_STAT_COUNT = { min: 1, max: 3 }
export const SUB_STAT_ROLL = { min: 0.5, max: 1 }

export interface IEquipmentTemplate {
  id: string
  name: string
  emoji: string
  slot: EnumEquipmentSlot
  // Set pieces share a setId; plain items have null.
  setId: string | null
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
  currency: 'coin' | 'gem'
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
    price: 5,
    currency: 'gem',
  },
]

export const findMaterial = (materialId: string) =>
  MATERIALS.find(material => (material.id as string) === materialId)

// Set bonuses are percent boosts to the monster's stats. Pieces from different sets mix: every set
// with 2+ pieces worn gives its 2-piece bonus, 4 pieces give both. Special battle effects arrive
// with the boss sets in phase 5; none are droppable yet, so the table starts empty.
export interface ISetDefinition {
  name: string
  bonuses: { pieces: 2 | 4; pct: Partial<IBattleStats> }[]
}

export const SET_DEFINITIONS: Record<string, ISetDefinition> = {}

export interface IEquipmentItem {
  templateId: string
  slot: EnumEquipmentSlot
  setId: string | null
  grade: EnumEquipmentGrade
  mainValue: number
  subStats: Partial<Record<StatKey, number>>
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
}

export const NO_EQUIPMENT_BONUS: IEquipmentBonus = {
  flat: { hp: 0, atk: 0, def: 0, spd: 0 },
  pct: { hp: 0, atk: 0, def: 0, spd: 0 },
}

export interface IActiveSet {
  setId: string
  name: string
  pieces: number
  bonuses: ISetDefinition['bonuses']
}

export const calcSetBonuses = (
  items: IEquipmentItem[],
  definitions: Record<string, ISetDefinition> = SET_DEFINITIONS
): IActiveSet[] => {
  const pieces = new Map<string, number>()
  for (const item of items) {
    if (item.setId) {
      pieces.set(item.setId, (pieces.get(item.setId) ?? 0) + 1)
    }
  }
  const active: IActiveSet[] = []
  for (const [setId, count] of pieces) {
    const definition = definitions[setId]
    const bonuses = definition?.bonuses.filter(bonus => count >= bonus.pieces) ?? []
    if (definition && bonuses.length) {
      active.push({ setId, name: definition.name, pieces: count, bonuses })
    }
  }
  return active
}

export const calcEquipmentBonus = (
  items: IEquipmentItem[],
  definitions: Record<string, ISetDefinition> = SET_DEFINITIONS
): IEquipmentBonus => {
  const bonus: IEquipmentBonus = {
    flat: { ...NO_EQUIPMENT_BONUS.flat },
    pct: { ...NO_EQUIPMENT_BONUS.pct },
  }
  for (const item of items) {
    const stats = getItemStats(item)
    for (const key of STAT_KEYS) {
      bonus.flat[key] += stats[key]
    }
  }
  for (const set of calcSetBonuses(items, definitions)) {
    for (const setBonus of set.bonuses) {
      for (const key of STAT_KEYS) {
        bonus.pct[key] += setBonus.pct[key] ?? 0
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
export const rollEquipment = (
  grade: EnumEquipmentGrade,
  rand: () => number,
  templates: IEquipmentTemplate[] = EQUIPMENT_TEMPLATES
): IEquipmentItem => {
  const plain = templates.filter(template => template.setId === null)
  const template = plain[Math.floor(rand() * plain.length)]
  const multiplier = GRADE_MULTIPLIER[grade]
  const subCount =
    SUB_STAT_COUNT.min + Math.floor(rand() * (SUB_STAT_COUNT.max - SUB_STAT_COUNT.min + 1))
  const pool = [...STAT_KEYS]
  const subStats: Partial<Record<StatKey, number>> = {}
  for (let index = 0; index < subCount; index++) {
    const key = pool.splice(Math.floor(rand() * pool.length), 1)[0]
    const factor = SUB_STAT_ROLL.min + rand() * (SUB_STAT_ROLL.max - SUB_STAT_ROLL.min)
    subStats[key] = Math.max(1, Math.round(SUB_STAT_BASE[key] * multiplier * factor))
  }
  return {
    templateId: template.id,
    slot: template.slot,
    setId: template.setId,
    grade,
    mainValue: Math.round(SLOT_MAIN_STAT[template.slot].base * multiplier),
    subStats,
    enhanceLevel: 0,
  }
}
