import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { AuthUser, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import { WorldBossAttackBodyDto } from './dto/social.dto'
import {
  ClaimWorldBossBodyDto,
  WorldBossExchangeBodyDto,
  WorldBossRankingQueryDto,
} from './dto/world-boss.dto'
import { WorldBossService } from './world-boss.service'

@Controller('world-boss')
export class WorldBossController {
  constructor(private readonly worldBossService: WorldBossService) {}

  @AuthUser()
  @Get()
  async getStatus(@ReqUser() user: IAppJwtPayload) {
    return this.worldBossService.getStatus(user['user-id'])
  }

  @AuthUser()
  @Post('attack')
  async attack(@Body() body: WorldBossAttackBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.worldBossService.attack(user['user-id'], body.supportId)
  }

  @AuthUser()
  @Get('ranking')
  async getRanking(@Query() query: WorldBossRankingQueryDto, @ReqUser() user: IAppJwtPayload) {
    return this.worldBossService.getRanking(user['user-id'], query.week)
  }

  @AuthUser()
  @Post('claim')
  async claim(@Body() body: ClaimWorldBossBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.worldBossService.claim(user['user-id'], body.week)
  }

  @AuthUser()
  @Post('exchange')
  async exchange(@Body() body: WorldBossExchangeBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.worldBossService.exchange(user['user-id'], body.bossId, body.slot, body.grade)
  }
}
