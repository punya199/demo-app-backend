import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { AuthUser, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import {
  ClaimSeasonBodyDto,
  LeaderboardQueryDto,
  PvpBattleBodyDto,
  SetDefenseBodyDto,
} from './dto/pvp.dto'
import { PvpService } from './pvp.service'

@Controller('pvp')
export class PvpController {
  constructor(private readonly pvpService: PvpService) {}

  @AuthUser()
  @Get()
  async getStatus(@ReqUser() user: IAppJwtPayload) {
    return this.pvpService.getStatus(user['user-id'])
  }

  @AuthUser()
  @Post('defense')
  async setDefense(@Body() body: SetDefenseBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.pvpService.setDefense(user['user-id'], body.displayName)
  }

  @AuthUser()
  @Get('opponents')
  async getOpponents(@ReqUser() user: IAppJwtPayload) {
    return this.pvpService.getOpponents(user['user-id'])
  }

  @AuthUser()
  @Post('battle')
  async battle(@Body() body: PvpBattleBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.pvpService.battle(user['user-id'], body.opponentId)
  }

  @AuthUser()
  @Get('history')
  async getHistory(@ReqUser() user: IAppJwtPayload) {
    return this.pvpService.getHistory(user['user-id'])
  }

  @AuthUser()
  @Get('history/:id/replay')
  async getReplay(@Param('id') id: string, @ReqUser() user: IAppJwtPayload) {
    return this.pvpService.getReplay(user['user-id'], id)
  }

  @AuthUser()
  @Get('leaderboard')
  async getLeaderboard(@Query() query: LeaderboardQueryDto, @ReqUser() user: IAppJwtPayload) {
    return this.pvpService.getLeaderboard(user['user-id'], query.season)
  }

  @AuthUser()
  @Post('season/claim')
  async claimSeason(@Body() body: ClaimSeasonBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.pvpService.claimSeason(user['user-id'], body.season)
  }
}
