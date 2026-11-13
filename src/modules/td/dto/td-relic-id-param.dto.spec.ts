import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { RELIC_IDS } from '../../../libs/td-sim'
import { TdRelicIdParamDto } from './td-relic-id-param.dto'

const errors = (id: unknown) => validate(plainToInstance(TdRelicIdParamDto, { id }))

describe('TdRelicIdParamDto', () => {
  it('accepts every relic id', async () => {
    for (const id of RELIC_IDS) expect(await errors(id)).toHaveLength(0)
  })

  it('rejects unknown, empty, injected and non-string ids', async () => {
    for (const id of ['nobody', '', '../x', "ember-brand'; --", 7, undefined])
      expect(await errors(id)).not.toHaveLength(0)
  })
})
