import { IsIn } from 'class-validator'
import { ACHIEVEMENTS, DAILY_GOALS } from '../goals.config'

export class TdDailyGoalIdParamDto {
  @IsIn(DAILY_GOALS.map(g => g.id))
  id: string
}

export class TdAchievementIdParamDto {
  @IsIn(ACHIEVEMENTS.map(a => a.id))
  id: string
}
