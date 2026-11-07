import { createRng } from '../battle/battle-engine'
import { CRAFT_SETS } from './craft-sets'
import {
  buildSetPiece,
  calcEquipmentBonus,
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
  EnumEquipmentGrade,
  EnumEquipmentSlot,
} from './equipment-data'
import { EnumMonsterStage } from '../../../db/entities/monster.entity'

describe('craft set effects and care', () => {
  const wear = (setId: string, count: number) =>
    Object.values(EnumEquipmentSlot)
      .slice(0, count)
      .map(slot => ({
        ...buildSetPiece(`${setId}_${slot}`, EnumEquipmentGrade.EPIC, createRng(1)),
        enhanceLevel: 0,
      }))

  it('merges every new effect key from a 4-piece set instead of dropping it', () => {
    for (const set of CRAFT_SETS) {
      const four = set.bonuses.find(bonus => bonus.pieces === 4)!.effect!
      const merged = calcEquipmentBonus(wear(set.id, 4)).effects
      for (const key of Object.keys(four) as (keyof typeof four)[]) {
        expect(merged[key]).toBe(four[key])
      }
    }
  })

  it('gives the care perks of a 2-piece bonus to calcSpecialBonuses, under the 2x cap', () => {
    expect(calcSpecialBonuses(wear('caretaker', 1)).hungerDrainMultiplier).toBe(1)
    const two = calcSpecialBonuses(wear('caretaker', 2))
    expect(two.hungerDrainMultiplier).toBeCloseTo(0.9)
    expect(two.poopRateMultiplier).toBeCloseTo(0.85)
    const piece = (value: number) => ({
      setId: 'caretaker',
      specialOptions: [{ key: 'slowHunger' as const, value }],
    })
    expect(
      calcSpecialBonuses([piece(15), piece(15), piece(15), piece(15)]).hungerDrainMultiplier
    ).toBeCloseTo(0.7)
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
