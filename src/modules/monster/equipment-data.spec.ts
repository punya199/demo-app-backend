import { createRng } from './battle-engine'
import {
  buildSetPiece,
  calcEquipmentBonus,
  calcSetBonuses,
  calcSetProgress,
  calcDismantleYield,
  calcSpecialBonuses,
  EnumMaterialId,
  MATERIALS,
  refineTiersFor,
  rollSubStatValue,
  SUB_STAT_BASE,
  SUB_STAT_ROLL,
  GRADE_MULTIPLIER,
  canEquip,
  SPECIAL_DEFINITIONS,
  SUB_STAT_COUNT_BY_GRADE,
  EnumEquipmentGrade,
  EnumEquipmentSlot,
  enhanceMultiplier,
  findSetPieceTemplate,
  getItemStats,
  IEquipmentItem,
  ISetDefinition,
  rollEquipment,
  rollGrade,
  SET_DEFINITIONS,
  SLOT_MAIN_STAT,
} from './equipment-data'
import { EnumMonsterStage } from '../../db/entities/monster.entity'
import { SET_ENHANCE_THRESHOLD } from './monster-rules'

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

describe('boss sets', () => {
  const wearSet = (setId: string, count: number, enhanceLevel = 0) =>
    Object.values(EnumEquipmentSlot)
      .slice(0, count)
      .map(slot => ({
        ...buildSetPiece(`${setId}_${slot}`, EnumEquipmentGrade.EPIC, createRng(1)),
        enhanceLevel,
      }))

  it('has all four slots as templates for each set', () => {
    for (const setId of Object.keys(SET_DEFINITIONS)) {
      for (const slot of Object.values(EnumEquipmentSlot)) {
        expect(findSetPieceTemplate(setId, slot)).toBeDefined()
      }
    }
    expect(Object.keys(SET_DEFINITIONS).sort()).toEqual(
      [
        'blazing',
        'deep_root',
        'nightfall',
        'radiant',
        'shadow_veil',
        'swift_thunder',
        'tidal_guard',
      ].sort()
    )
  })

  it('rolls set pieces like plain ones, with a stronger main stat', () => {
    const piece = buildSetPiece('blazing_weapon', EnumEquipmentGrade.EPIC, createRng(3))
    expect(buildSetPiece('blazing_weapon', EnumEquipmentGrade.EPIC, createRng(3))).toEqual(piece)
    expect(piece.mainValue).toBe(Math.round(4 * 2.2 * 1.2))
    expect(piece.mainValue).toBeGreaterThan(Math.round(4 * 2.2))
    expect(() => buildSetPiece('wooden_sword', EnumEquipmentGrade.COMMON, createRng(1))).toThrow()
  })

  it('rolls set-piece secondary stats by grade, and always a special on legendary', () => {
    for (const grade of Object.values(EnumEquipmentGrade)) {
      const { min, max } = SUB_STAT_COUNT_BY_GRADE[grade]
      for (let seed = 1; seed <= 50; seed++) {
        const piece = buildSetPiece('blazing_armor', grade, createRng(seed))
        const count = Object.keys(piece.subStats).length
        expect(count).toBeGreaterThanOrEqual(min)
        expect(count).toBeLessThanOrEqual(max)
        if (grade === EnumEquipmentGrade.LEGENDARY) {
          expect(piece.specialOptions?.length).toBeGreaterThanOrEqual(1)
        }
        if (grade === EnumEquipmentGrade.COMMON) {
          expect(piece.specialOptions).toEqual([])
        }
      }
    }
  })

  it('applies the arena set bonuses: percent at 2 pieces, a battle effect at 4', () => {
    expect(calcEquipmentBonus(wearSet('blazing', 2)).pct.atk).toBeCloseTo(0.08)
    expect(calcEquipmentBonus(wearSet('blazing', 2)).effects).toEqual({})
    expect(calcEquipmentBonus(wearSet('blazing', 4)).effects).toEqual({
      burnTurns: 1.6,
      burnBonus: 0.1,
    })
    expect(calcEquipmentBonus(wearSet('tidal_guard', 2)).pct.def).toBeCloseTo(0.1)
    expect(calcEquipmentBonus(wearSet('tidal_guard', 4)).effects).toEqual({
      shieldPct: 0.04,
      shieldRefresh: 0.04,
    })
    expect(calcEquipmentBonus(wearSet('deep_root', 2)).pct.hp).toBeCloseTo(0.1)
    expect(calcEquipmentBonus(wearSet('deep_root', 4)).effects.regenPct).toBe(0.045)
    expect(calcEquipmentBonus(wearSet('swift_thunder', 2)).pct.spd).toBeCloseTo(0.08)
    expect(calcEquipmentBonus(wearSet('swift_thunder', 4)).effects).toEqual({
      doubleStrikeChance: 0.15,
      cooldownCut: 0.18,
    })
    expect(calcEquipmentBonus(wearSet('radiant', 4)).effects).toEqual({ lastStandShield: 0.14 })
    expect(calcEquipmentBonus(wearSet('nightfall', 4)).effects).toEqual({
      critChance: 0.06,
      critDamage: 0.12,
    })
    expect(calcEquipmentBonus(wearSet('shadow_veil', 4)).effects).toEqual({
      evasion: 0.15,
      dodgeCdCutSec: 4,
      afterDodgeBonus: 0.85,
    })
  })

  it('multiplies the percent bonus by 1.5 only when every worn piece is +10 or more', () => {
    expect(calcEquipmentBonus(wearSet('blazing', 2, 10)).pct.atk).toBeCloseTo(0.08 * 1.5)
    const mixed = [...wearSet('blazing', 2, 10).slice(0, 1), ...wearSet('blazing', 2, 9).slice(1)]
    expect(calcEquipmentBonus(mixed).pct.atk).toBeCloseTo(0.08)
    // the battle effect is never boosted
    expect(calcEquipmentBonus(wearSet('blazing', 4, 15)).effects).toEqual({
      burnTurns: 1.6,
      burnBonus: 0.1,
    })
  })

  it('combines effects from different sets and mixes 2+2', () => {
    const mixed = [...wearSet('blazing', 4).slice(0, 2), ...wearSet('deep_root', 4).slice(2)]
    const bonus = calcEquipmentBonus(mixed)
    expect(bonus.pct.atk).toBeCloseTo(0.08)
    expect(bonus.pct.hp).toBeCloseTo(0.1)
    expect(bonus.effects).toEqual({})
  })
})

describe('grade rolls: sub stats and special options', () => {
  const grades = Object.values(EnumEquipmentGrade)
  const roll = (grade: EnumEquipmentGrade, seed: number) => rollEquipment(grade, createRng(seed))

  it('rolls the sub-stat count of the grade, never the main stat twice', () => {
    for (const grade of grades) {
      const { min, max } = SUB_STAT_COUNT_BY_GRADE[grade]
      for (let seed = 1; seed <= 200; seed++) {
        const count = Object.keys(roll(grade, seed).subStats).length
        expect(count).toBeGreaterThanOrEqual(min)
        expect(count).toBeLessThanOrEqual(max)
      }
    }
  })

  it('common never has a special option, legendary always does', () => {
    for (let seed = 1; seed <= 200; seed++) {
      expect(roll(EnumEquipmentGrade.COMMON, seed).specialOptions).toEqual([])
      expect(
        roll(EnumEquipmentGrade.LEGENDARY, seed).specialOptions!.length
      ).toBeGreaterThanOrEqual(1)
    }
  })

  it('special odds match the grade table and values stay in range, no duplicates', () => {
    const n = 5000
    const has = { rare: 0, epic: 0, second: 0 }
    for (let seed = 1; seed <= n; seed++) {
      const rare = roll(EnumEquipmentGrade.RARE, seed).specialOptions!
      const epic = roll(EnumEquipmentGrade.EPIC, seed + 100_000).specialOptions!
      const legendary = roll(EnumEquipmentGrade.LEGENDARY, seed + 200_000).specialOptions!
      has.rare += rare.length > 0 ? 1 : 0
      has.epic += epic.length > 0 ? 1 : 0
      has.second += legendary.length === 2 ? 1 : 0
      expect(new Set(legendary.map(o => o.key)).size).toBe(legendary.length)
      for (const { key, value } of [...rare, ...epic, ...legendary]) {
        expect(value).toBeGreaterThanOrEqual(SPECIAL_DEFINITIONS[key].min)
        expect(value).toBeLessThanOrEqual(SPECIAL_DEFINITIONS[key].max)
      }
    }
    expect(has.rare / n).toBeCloseTo(0.15, 1)
    expect(has.epic / n).toBeCloseTo(0.5, 1)
    expect(has.second / n).toBeCloseTo(0.25, 1)
  })
})

describe('calcSpecialBonuses', () => {
  it('is neutral without pieces or options', () => {
    expect(calcSpecialBonuses([{}])).toEqual({
      hungerDrainMultiplier: 1,
      staminaCostMultiplier: 1,
      poopRateMultiplier: 1,
      dropMultiplier: 1,
    })
  })

  it('adds up across pieces and caps each option at 2x its base max', () => {
    const piece = (value: number) => ({ specialOptions: [{ key: 'slowHunger' as const, value }] })
    expect(calcSpecialBonuses([piece(10), piece(5)]).hungerDrainMultiplier).toBeCloseTo(0.85)
    expect(calcSpecialBonuses([piece(15), piece(15), piece(15)]).hungerDrainMultiplier).toBeCloseTo(
      0.7
    )
  })
})

describe('canEquip', () => {
  const stages = Object.values(EnumMonsterStage)
  const allowed = (grade: EnumEquipmentGrade) => stages.filter(stage => canEquip(stage, grade))

  it('gates each grade by the youngest form that may wear it', () => {
    expect(allowed(EnumEquipmentGrade.COMMON)).toEqual(stages)
    expect(allowed(EnumEquipmentGrade.RARE)).toEqual([
      EnumMonsterStage.ADULT,
      EnumMonsterStage.PERFECT,
      EnumMonsterStage.ULTIMATE,
      EnumMonsterStage.FUSED,
    ])
    for (const grade of [EnumEquipmentGrade.EPIC, EnumEquipmentGrade.LEGENDARY]) {
      expect(allowed(grade)).toEqual([
        EnumMonsterStage.PERFECT,
        EnumMonsterStage.ULTIMATE,
        EnumMonsterStage.FUSED,
      ])
    }
  })
})

describe('refine stones', () => {
  it('lets the lowest covering tier work on each enhance level', () => {
    const lowest = (level: number) => refineTiersFor(level)[0].material
    for (const level of [0, 4]) {
      expect(lowest(level)).toBe(EnumMaterialId.REFINE_COMMON)
    }
    for (const level of [5, 8]) {
      expect(lowest(level)).toBe(EnumMaterialId.REFINE_RARE)
    }
    for (const level of [9, 12]) {
      expect(lowest(level)).toBe(EnumMaterialId.REFINE_EPIC)
    }
    for (const level of [13, 15]) {
      expect(lowest(level)).toBe(EnumMaterialId.REFINE_LEGENDARY)
    }
    // a higher tier also covers everything below it
    expect(refineTiersFor(3)).toHaveLength(4)
    expect(refineTiersFor(15)).toHaveLength(1)
  })

  it('rolls a refined value in the same window as a fresh drop', () => {
    const rand = createRng(5)
    for (const grade of Object.values(EnumEquipmentGrade)) {
      const scale = SUB_STAT_BASE.atk * GRADE_MULTIPLIER[grade]
      for (let index = 0; index < 200; index++) {
        const value = rollSubStatValue('atk', grade, rand)
        expect(value).toBeGreaterThanOrEqual(Math.max(1, Math.round(scale * SUB_STAT_ROLL.min)))
        expect(value).toBeLessThanOrEqual(Math.round(scale * SUB_STAT_ROLL.max))
      }
    }
  })

  it('pays enhance stones by grade and level, and one refine stone by enhance level', () => {
    expect(calcDismantleYield(EnumEquipmentGrade.COMMON, 0)).toEqual({
      enhanceStones: 1,
      refineStone: EnumMaterialId.REFINE_COMMON,
    })
    expect(calcDismantleYield(EnumEquipmentGrade.LEGENDARY, 15)).toEqual({
      enhanceStones: 10 + 3,
      refineStone: EnumMaterialId.REFINE_RARE,
    })
    expect(calcDismantleYield(EnumEquipmentGrade.RARE, 4).refineStone).toBe(
      EnumMaterialId.REFINE_COMMON
    )
    expect(calcDismantleYield(EnumEquipmentGrade.RARE, 5).refineStone).toBe(
      EnumMaterialId.REFINE_RARE
    )
  })
})

describe('shop stones', () => {
  it('sells the enhance stone and the common refine stone for coins, and no higher refine stone', () => {
    const sold = new Map(MATERIALS.map(material => [material.id, material]))
    expect(sold.get(EnumMaterialId.ENHANCE_STONE)?.currency).toBe('coin')
    expect(sold.get(EnumMaterialId.REFINE_COMMON)?.currency).toBe('coin')
    for (const material of [
      EnumMaterialId.REFINE_RARE,
      EnumMaterialId.REFINE_EPIC,
      EnumMaterialId.REFINE_LEGENDARY,
    ]) {
      expect(sold.has(material)).toBe(false)
    }
  })
})
