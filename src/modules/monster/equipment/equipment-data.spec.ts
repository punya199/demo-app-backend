import { createRng } from '../battle/battle-engine'
import {
  calcEquipmentBonus,
  calcSetBonuses,
  calcSetProgress,
  EnumEquipmentGrade,
  EnumEquipmentSlot,
  enhanceMultiplier,
  getItemStats,
  IEquipmentItem,
  ISetDefinition,
  rollEquipment,
  rollGrade,
  SLOT_MAIN_STAT,
} from './equipment-data'
import { SET_ENHANCE_THRESHOLD } from '../core/monster-rules'

const item = (overrides: Partial<IEquipmentItem> = {}): IEquipmentItem => ({
  templateId: 'wooden_sword',
  slot: EnumEquipmentSlot.WEAPON,
  setId: null,
  grade: EnumEquipmentGrade.COMMON,
  mainValue: 4,
  subStats: { hp: 3 },
  enhanceLevel: 0,
  ...overrides,
})

const sets: Record<string, ISetDefinition> = {
  fire: {
    name: 'fire',
    bonuses: [
      { pieces: 2, pct: { atk: 0.15 } },
      { pieces: 4, pct: { spd: 0.1 } },
    ],
  },
  water: { name: 'water', bonuses: [{ pieces: 2, pct: { def: 0.2 } }] },
}

describe('enhance multiplier', () => {
  it('adds 5% per level and 5% more at every fifth level', () => {
    expect(enhanceMultiplier(0)).toBe(1)
    expect(enhanceMultiplier(4)).toBeCloseTo(1.2)
    expect(enhanceMultiplier(5)).toBeCloseTo(1.3)
    expect(enhanceMultiplier(10)).toBeCloseTo(1.6)
    expect(enhanceMultiplier(15)).toBeCloseTo(1.9)
  })
})

describe('getItemStats', () => {
  it('adds the enhanced main stat and the secondary stats', () => {
    expect(getItemStats(item({ enhanceLevel: 10 }))).toEqual({ hp: 3, atk: 6, def: 0, spd: 0 })
  })
})

describe('set bonuses', () => {
  const piece = (setId: string | null, slot: EnumEquipmentSlot) => item({ setId, slot })

  it('needs two pieces of a set, and four for the second tier', () => {
    expect(calcSetBonuses([piece('fire', EnumEquipmentSlot.WEAPON)], sets)).toEqual([])
    const two = calcSetBonuses(
      [piece('fire', EnumEquipmentSlot.WEAPON), piece('fire', EnumEquipmentSlot.ARMOR)],
      sets
    )
    expect(two[0].bonuses).toHaveLength(1)
    const four = calcSetBonuses(
      Object.values(EnumEquipmentSlot).map(slot => piece('fire', slot)),
      sets
    )
    expect(four[0].bonuses).toHaveLength(2)
  })

  it('mixes two sets as 2+2 and ignores plain items and unknown sets', () => {
    const items = [
      piece('fire', EnumEquipmentSlot.WEAPON),
      piece('fire', EnumEquipmentSlot.ARMOR),
      piece('water', EnumEquipmentSlot.HELMET),
      piece('water', EnumEquipmentSlot.ACCESSORY),
    ]
    const bonus = calcEquipmentBonus(items, sets)
    expect(bonus.pct.atk).toBeCloseTo(0.15)
    expect(bonus.pct.def).toBeCloseTo(0.2)
    expect(calcEquipmentBonus([piece(null, EnumEquipmentSlot.WEAPON)], sets).pct.atk).toBe(0)
    expect(calcSetBonuses([piece('nope', EnumEquipmentSlot.WEAPON)], sets)).toEqual([])
  })

  it('sums flat stats across pieces', () => {
    const bonus = calcEquipmentBonus([
      item(),
      item({ slot: EnumEquipmentSlot.HELMET, mainValue: 15 }),
    ])
    expect(bonus.flat).toEqual({ hp: 3 + 3 + 15, atk: 4, def: 0, spd: 0 })
  })
})

describe('set progress', () => {
  const piece = (setId: string | null, slot: EnumEquipmentSlot, enhanceLevel = 0) =>
    item({ setId, slot, enhanceLevel })

  it('lists every set with its worn count, full piece count and tiers', () => {
    const progress = calcSetProgress(
      [
        piece('fire', EnumEquipmentSlot.WEAPON),
        piece('fire', EnumEquipmentSlot.ARMOR),
        piece(null, EnumEquipmentSlot.HELMET),
      ],
      sets
    )
    expect(progress.map(row => [row.setId, row.worn, row.pieceCount])).toEqual([
      ['fire', 2, 4],
      ['water', 0, 2],
    ])
    expect(progress[0].tiers).toEqual([
      { pieces: 2, pct: { atk: 0.15 }, effect: null },
      { pieces: 4, pct: { spd: 0.1 }, effect: null },
    ])
  })

  it('counts only the worn pieces handed in, so each pet has its own count', () => {
    const petA = [piece('fire', EnumEquipmentSlot.WEAPON), piece('fire', EnumEquipmentSlot.ARMOR)]
    const petB = [piece('fire', EnumEquipmentSlot.HELMET)]
    expect(calcSetProgress(petA, sets)[0].worn).toBe(2)
    expect(calcSetProgress(petB, sets)[0].worn).toBe(1)
  })

  it('marks a set enhanced only when every worn piece is at the threshold', () => {
    const level = SET_ENHANCE_THRESHOLD
    const both = [
      piece('fire', EnumEquipmentSlot.WEAPON, level),
      piece('fire', EnumEquipmentSlot.ARMOR, level),
    ]
    expect(calcSetProgress(both, sets)[0].isEnhanced).toBe(true)
    expect(
      calcSetProgress([...both, piece('fire', EnumEquipmentSlot.HELMET, level - 1)], sets)[0]
        .isEnhanced
    ).toBe(false)
    expect(calcSetProgress([], sets)[0].isEnhanced).toBe(false)
  })

  it('agrees with the live bonuses about which sets are enhanced', () => {
    const worn = [
      piece('fire', EnumEquipmentSlot.WEAPON, SET_ENHANCE_THRESHOLD),
      piece('fire', EnumEquipmentSlot.ARMOR, SET_ENHANCE_THRESHOLD),
    ]
    expect(calcSetProgress(worn, sets)[0].isEnhanced).toBe(calcSetBonuses(worn, sets)[0].isEnhanced)
  })
})

describe('rolling', () => {
  it('picks grades by odds', () => {
    const rates = { [EnumEquipmentGrade.COMMON]: 70, [EnumEquipmentGrade.RARE]: 30 }
    expect(rollGrade(rates, 0)).toBe(EnumEquipmentGrade.COMMON)
    expect(rollGrade(rates, 0.69)).toBe(EnumEquipmentGrade.COMMON)
    expect(rollGrade(rates, 0.71)).toBe(EnumEquipmentGrade.RARE)
    expect(rollGrade(rates, 0.999999)).toBe(EnumEquipmentGrade.RARE)
  })

  it('matches the odds over many rolls', () => {
    const rand = createRng(7)
    const counts: Record<string, number> = {}
    for (let index = 0; index < 20000; index++) {
      const grade = rollGrade({ common: 70, rare: 25, epic: 5 }, rand())
      counts[grade] = (counts[grade] ?? 0) + 1
    }
    expect(counts.common / 20000).toBeCloseTo(0.7, 1)
    expect(counts.rare / 20000).toBeCloseTo(0.25, 1)
    expect(counts.epic / 20000).toBeCloseTo(0.05, 1)
  })

  it('rolls 1-3 distinct secondary stats and a main value that scales with grade', () => {
    const rand = createRng(1)
    for (let index = 0; index < 300; index++) {
      const rolled = rollEquipment(EnumEquipmentGrade.EPIC, rand)
      const keys = Object.keys(rolled.subStats)
      expect(keys.length).toBeGreaterThanOrEqual(1)
      expect(keys.length).toBeLessThanOrEqual(3)
      expect(rolled.mainValue).toBe(Math.round(SLOT_MAIN_STAT[rolled.slot].base * 2.2))
      expect(rolled.setId).toBeNull()
    }
  })
})
