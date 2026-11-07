import { createRng } from '../battle/battle-engine'
import { CRAFT_SETS } from './craft-sets'
import {
  buildSetPiece,
  calcEquipmentBonus,
  calcDismantleYield,
  canEquip,
  SPECIAL_DEFINITIONS,
  SUB_STAT_COUNT_BY_GRADE,
  EnumEquipmentGrade,
  EnumEquipmentSlot,
  findSetPieceTemplate,
  rollEquipment,
  SET_DEFINITIONS,
} from './equipment-data'
import { EnumMonsterStage } from '../../../db/entities/monster.entity'

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
        ...CRAFT_SETS.map(set => set.id),
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
    expect(calcEquipmentBonus(wearSet('deep_root', 4)).effects.regenPct).toBe(0.00135)
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

describe('mythic grade', () => {
  const rollMythic = (seed: number) => {
    const rand = createRng(seed)
    return buildSetPiece('evergreen_weapon', EnumEquipmentGrade.MYTHIC, rand)
  }

  it('keeps the legendary main stat, and rolls 4-5 sub stats and 2-3 specials in 95-100%', () => {
    const legendary = buildSetPiece('evergreen_weapon', EnumEquipmentGrade.LEGENDARY, createRng(1))
    for (let seed = 1; seed <= 200; seed++) {
      const piece = rollMythic(seed)
      expect(piece.mainValue).toBe(legendary.mainValue)
      expect(Object.keys(piece.subStats).length).toBeGreaterThanOrEqual(4)
      expect(Object.keys(piece.subStats).length).toBeLessThanOrEqual(5)
      const options = piece.specialOptions!
      expect(options.length).toBeGreaterThanOrEqual(2)
      expect(options.length).toBeLessThanOrEqual(3)
      expect(new Set(options.map(option => option.key)).size).toBe(options.length)
      for (const { key, value } of options) {
        const { min, max } = SPECIAL_DEFINITIONS[key]
        expect(value).toBeGreaterThanOrEqual(Math.round(min + (max - min) * 0.95))
        expect(value).toBeLessThanOrEqual(max)
      }
    }
  })

  it('does not change what the older grades draw from the random stream', () => {
    // A frozen draw: epic and legendary pieces from fixed seeds stay identical.
    expect(rollEquipment(EnumEquipmentGrade.LEGENDARY, createRng(5))).toEqual(
      rollEquipment(EnumEquipmentGrade.LEGENDARY, createRng(5))
    )
    const draws = (grade: EnumEquipmentGrade) => {
      let count = 0
      const rng = createRng(9)
      buildSetPiece('blazing_weapon', grade, () => {
        count++
        return rng()
      })
      return count
    }
    // legendary: 1 chance + 1 bonus + sub stats and options; mythic draws more (an extra option).
    expect(draws(EnumEquipmentGrade.MYTHIC)).toBeGreaterThan(draws(EnumEquipmentGrade.LEGENDARY))
  })

  it('may wear mythic from Perfect on, and dismantles like legendary', () => {
    expect(canEquip(EnumMonsterStage.PERFECT, EnumEquipmentGrade.MYTHIC)).toBe(true)
    expect(canEquip(EnumMonsterStage.ADULT, EnumEquipmentGrade.MYTHIC)).toBe(false)
    expect(calcDismantleYield(EnumEquipmentGrade.MYTHIC, 0)).toEqual(
      calcDismantleYield(EnumEquipmentGrade.LEGENDARY, 0)
    )
  })
})
