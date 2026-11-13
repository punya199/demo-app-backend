import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { STAGE_COUNT } from '../../../libs/td-sim'
import { TdStageIdParamDto } from './td-stage-id-param.dto'

const errors = (id: unknown) => validate(plainToInstance(TdStageIdParamDto, { id }))

describe('TdStageIdParamDto', () => {
  it('accepts every stage number, as the string a URL carries', async () => {
    for (let i = 1; i <= STAGE_COUNT; i++) expect(await errors(String(i))).toHaveLength(0)
  })

  it('rejects zero, out-of-range, fractional and non-numeric ids', async () => {
    for (const id of ['0', String(STAGE_COUNT + 1), '1.5', 'x', '', '-1', undefined]) {
      expect(await errors(id)).not.toHaveLength(0)
    }
  })
})
