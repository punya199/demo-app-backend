import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { AuthUser, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import { TdAchievementIdParamDto, TdDailyGoalIdParamDto } from './dto/td-goal-id-param.dto'
import { TdGoalsService } from './td-goals.service'
import { tdRateLimitGuard } from './td-rate-limit.guard'

// Claims take no body: the server decides what is owed from its own records.
@Controller('td/goals')
export class TdGoalsController {
  constructor(private readonly goalsService: TdGoalsService) {}

  @UseGuards(tdRateLimitGuard)
  @AuthUser()
  @Get()
  getGoals(@ReqUser() user: IAppJwtPayload) {
    return this.goalsService.getGoals(user['user-id'])
  }

  @UseGuards(tdRateLimitGuard)
  @AuthUser()
  @Post('daily/:id/claim')
  claimDaily(@ReqUser() user: IAppJwtPayload, @Param() p: TdDailyGoalIdParamDto) {
    return this.goalsService.claimDaily(user['user-id'], p.id)
  }

  @UseGuards(tdRateLimitGuard)
  @AuthUser()
  @Post('track/claim')
  claimTrack(@ReqUser() user: IAppJwtPayload) {
    return this.goalsService.claimTrack(user['user-id'])
  }

  @UseGuards(tdRateLimitGuard)
  @AuthUser()
  @Post('achievements/:id/claim')
  claimAchievement(@ReqUser() user: IAppJwtPayload, @Param() p: TdAchievementIdParamDto) {
    return this.goalsService.claimAchievement(user['user-id'], p.id)
  }
}
