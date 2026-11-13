import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { ACHIEVEMENTS, DAILY_GOALS } from '../goals.config'
import { TdAchievementIdParamDto, TdDailyGoalIdParamDto } from './td-goal-id-param.dto'

describe('goal id param DTOs', () => {
  it('accept every configured id', async () => {
    for (const g of DAILY_GOALS) {
      expect(await validate(plainToInstance(TdDailyGoalIdParamDto, { id: g.id }))).toHaveLength(0)
    }
    for (const a of ACHIEVEMENTS) {
      expect(await validate(plainToInstance(TdAchievementIdParamDto, { id: a.id }))).toHaveLength(0)
    }
  })

  it('reject unknown, cross-kind, empty and non-string ids', async () => {
    for (const id of ['nobody', 'stars_3', '', '../x', 7, undefined]) {
      expect(await validate(plainToInstance(TdDailyGoalIdParamDto, { id }))).not.toHaveLength(0)
    }
    expect(
      await validate(plainToInstance(TdAchievementIdParamDto, { id: 'win_battle' }))
    ).not.toHaveLength(0)
  })
})
