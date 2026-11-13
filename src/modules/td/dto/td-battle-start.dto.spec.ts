import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { STAGE_COUNT } from '../../../libs/td-sim'
import { TdBattleStartDto } from './td-battle-start.dto'

const errors = (body: unknown) => validate(plainToInstance(TdBattleStartDto, body))

describe('TdBattleStartDto', () => {
  it('accepts every stage the sim has', async () => {
    for (let stageId = 1; stageId <= STAGE_COUNT; stageId++) {
      expect(await errors({ stageId })).toHaveLength(0)
    }
  })

  it('rejects a missing, out-of-range, fractional or non-numeric stage id', async () => {
    for (const stageId of [undefined, 0, STAGE_COUNT + 1, 1.5, '1', null, -1]) {
      expect(await errors({ stageId })).not.toHaveLength(0)
    }
    expect(await errors({})).not.toHaveLength(0)
  })
})
