import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { TD_HEROES } from '../gacha.config'
import { TdHeroIdParamDto } from './td-hero-id-param.dto'

const errors = (id: unknown) => validate(plainToInstance(TdHeroIdParamDto, { id }))

describe('TdHeroIdParamDto', () => {
  it('accepts every gacha hero id', async () => {
    for (const hero of TD_HEROES) expect(await errors(hero.id)).toHaveLength(0)
  })

  it('rejects unknown, empty and non-string ids', async () => {
    for (const id of ['nobody', '', '../x', 7, undefined]) {
      expect(await errors(id)).not.toHaveLength(0)
    }
  })
})
