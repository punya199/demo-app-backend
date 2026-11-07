import { buildCraftOverview, CRAFT_RECIPES } from './craft-data'
import { CRAFT_SETS, findCraftSet, isCraftSetId, isFlagshipSetId } from './craft-sets'
import {
  BOX_GRADE_RATES,
  calcSpecialBonuses,
  EnumEquipmentGrade,
  rollGrade,
} from './equipment-data'
import { MonsterEquipmentModule } from './equipment.module'
import { NOW } from './equipment-test-helpers'

describe('craft-sets lookups', () => {
  const flagship = CRAFT_SETS.find(set => set.flagship)!
  const standard = CRAFT_SETS.find(set => !set.flagship)!

  it('finds a set by id', () => {
    expect(findCraftSet(standard.id)).toBe(standard)
    expect(findCraftSet('nope')).toBeUndefined()
  })

  it('isCraftSetId is false for empty and unknown ids', () => {
    expect(isCraftSetId(standard.id)).toBe(true)
    expect(isCraftSetId('nope')).toBe(false)
    expect(isCraftSetId(null)).toBe(false)
    expect(isCraftSetId(undefined)).toBe(false)
  })

  it('isFlagshipSetId separates flagship, standard, unknown and empty ids', () => {
    expect(isFlagshipSetId(flagship.id)).toBe(true)
    expect(isFlagshipSetId(standard.id)).toBe(false)
    expect(isFlagshipSetId('nope')).toBe(false)
    expect(isFlagshipSetId(null)).toBe(false)
  })
})

describe('rollGrade fallback', () => {
  it('returns the last grade when the roll is at the very top of the range', () => {
    const grades = Object.keys(BOX_GRADE_RATES)
    expect(rollGrade(BOX_GRADE_RATES, 1)).toBe(grades[grades.length - 1])
    expect(rollGrade(BOX_GRADE_RATES, 0)).toBe(grades[0])
    expect(rollGrade({ [EnumEquipmentGrade.RARE]: 1 }, 0.5)).toBe(EnumEquipmentGrade.RARE)
  })
})

describe('craft overview recipe names', () => {
  it('falls back to the template id when the template is unknown', () => {
    const recipe = CRAFT_RECIPES[0]
    const original = recipe.templateId
    recipe.templateId = 'missing_template'
    try {
      const overview = buildCraftOverview({
        job: null,
        owned: new Map(),
        pity: new Map(),
        coin: 0,
        now: NOW,
      })
      expect(overview.recipes[0].name).toBe('missing_template')
      expect(overview.recipes[1].name).not.toBe(CRAFT_RECIPES[1].templateId)
    } finally {
      recipe.templateId = original
    }
  })
})

describe('MonsterEquipmentModule', () => {
  it('is a Nest module exporting EquipmentService', () => {
    expect(Reflect.getMetadata('exports', MonsterEquipmentModule)).toHaveLength(1)
    expect(Reflect.getMetadata('controllers', MonsterEquipmentModule)).toHaveLength(4)
  })
})

describe('calcSpecialBonuses unknown set', () => {
  it('ignores a set id that has no definition', () => {
    expect(calcSpecialBonuses([{ setId: 'not_a_set' }, { setId: 'not_a_set' }])).toEqual({
      hungerDrainMultiplier: 1,
      staminaCostMultiplier: 1,
      poopRateMultiplier: 1,
      dropMultiplier: 1,
    })
  })
})
