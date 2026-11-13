import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { CORE_SLOTS } from '../../../libs/td-sim'
import { TdCoreEquipDto } from './td-core-equip.dto'
import { TdCoreIdParamDto } from './td-core-id-param.dto'

const slotErrors = (slot: unknown) => validate(plainToInstance(TdCoreEquipDto, { slot }))
const idErrors = (id: unknown) => validate(plainToInstance(TdCoreIdParamDto, { id }))

describe('TdCoreEquipDto', () => {
  it('accepts every slot', async () => {
    for (let s = 0; s < CORE_SLOTS; s++) expect(await slotErrors(s)).toHaveLength(0)
  })

  it('rejects out-of-range, fractional, string and missing slots', async () => {
    for (const s of [-1, CORE_SLOTS, 1.5, '1', null, undefined])
      expect(await slotErrors(s)).not.toHaveLength(0)
  })
})

describe('TdCoreIdParamDto', () => {
  it('accepts a uuid and rejects anything else', async () => {
    expect(await idErrors('3f1c2a6e-9b0d-4f55-8d7e-0a1b2c3d4e5f')).toHaveLength(0)
    for (const id of ['nope', '', '../x', 7, undefined])
      expect(await idErrors(id)).not.toHaveLength(0)
  })
})
