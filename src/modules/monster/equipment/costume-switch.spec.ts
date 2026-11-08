import { BadRequestException } from '@nestjs/common'
import { COSTUMES_ENABLED } from '../core/monster-rules'
import { toMonsterView } from '../core/monster-view'
import { EnumCostumeSlot } from './costume-data'
import { CostumeService, loadPublicCostumes } from './costume.service'
import { makeDataSource, makeEtm, petRow, USER } from './equipment-test-helpers'

// The costume system is switched off for now (COSTUMES_ENABLED in monster-rules.ts).
describe('costumes switched off', () => {
  const service = () => {
    const etm = makeEtm()
    return {
      etm,
      service: new CostumeService(
        makeDataSource(etm) as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never
      ),
    }
  }

  it('is off', () => {
    expect(COSTUMES_ENABLED).toBe(false)
  })

  it('refuses buying, wearing, taking off and the privacy toggle, before touching anything', async () => {
    const { etm, service: costumes } = service()
    const off = new BadRequestException('Costumes are switched off for now')
    await expect(costumes.buy(USER, 'cap')).rejects.toThrow(off)
    await expect(costumes.equip(USER, 'cap')).rejects.toThrow(off)
    await expect(costumes.unequip(USER, EnumCostumeSlot.HAT)).rejects.toThrow(off)
    await expect(costumes.setShowCostume(USER, true)).rejects.toThrow(off)
    expect(etm.query).not.toHaveBeenCalled()
  })

  it('shows no costume on other players, without querying', async () => {
    const etm = makeEtm()
    await expect(loadPublicCostumes(['u1', 'u2'], etm as never)).resolves.toEqual(new Map())
    expect(etm.query).not.toHaveBeenCalled()
  })

  it('sends the own pet without its stored loadout', () => {
    const pet = { ...petRow(), costume: { hat: 'cap' } }
    expect(toMonsterView(pet as never).costume).toEqual({})
  })
})
