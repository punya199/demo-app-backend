import { EquipmentItemEntity } from '../../../db/entities/equipment-item.entity'
import { EnumMonsterLine, EnumMonsterStage } from '../../../db/entities/monster.entity'
import { MonsterCoreModule } from './core.module'
import { defaultDisplayName } from './display-name'
import { loadSpecialBonus } from './special-bonus'
import { getSpecies, isStageAtLeast } from './species-data'
import { fakeEtm } from './core-test-helpers'

describe('defaultDisplayName', () => {
  it('is a short stable tag that never contains the user id', () => {
    const name = defaultDisplayName('user-1')
    expect(name).toMatch(/^ผู้ฝึก#[0-9a-f]{4}$/)
    expect(name).toBe(defaultDisplayName('user-1'))
    expect(name).not.toContain('user-1')
    expect(defaultDisplayName('user-2')).not.toBe(name)
  })
})

describe('loadSpecialBonus', () => {
  it('reads only the equipped items of one pet and totals their perks', async () => {
    const etm = fakeEtm()
    etm.find.mockResolvedValue([{ specialOptions: [], setId: null }])
    const bonus = await loadSpecialBonus('pet-1', etm)
    expect(etm.find).toHaveBeenCalledWith(EquipmentItemEntity, {
      where: { monsterId: 'pet-1', equipped: true },
    })
    expect(bonus.hungerDrainMultiplier).toBe(1)
    expect(bonus.poopRateMultiplier).toBe(1)
  })
})

describe('species-data helpers', () => {
  it('orders stages', () => {
    expect(isStageAtLeast(EnumMonsterStage.ADULT, EnumMonsterStage.BABY_2)).toBe(true)
    expect(isStageAtLeast(EnumMonsterStage.ADULT, EnumMonsterStage.ADULT)).toBe(true)
    expect(isStageAtLeast(EnumMonsterStage.EGG, EnumMonsterStage.ADULT)).toBe(false)
  })

  it('rejects an unknown species and finds a known one', () => {
    expect(() => getSpecies('nope')).toThrow('Unknown monster species: nope')
    expect(getSpecies(`${EnumMonsterLine.FLAME}_egg`).stage).toBe(EnumMonsterStage.EGG)
  })
})

describe('MonsterCoreModule', () => {
  it('is a Nest module', () => {
    expect(Reflect.getMetadata('providers', MonsterCoreModule)).toHaveLength(2)
  })
})
