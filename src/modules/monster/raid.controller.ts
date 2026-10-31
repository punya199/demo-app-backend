import { Body, Controller, Get, Post } from '@nestjs/common'
import { AuthUser, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import { RaidBattleBodyDto, RaidExchangeBodyDto } from './dto/raid.dto'
import { RaidService } from './raid.service'

@Controller('raid')
export class RaidController {
  constructor(private readonly raidService: RaidService) {}

  @AuthUser()
  @Get()
  async getRaid(@ReqUser() user: IAppJwtPayload) {
    return this.raidService.getRaid(user['user-id'])
  }

  @AuthUser()
  @Post('battle')
  async battle(@Body() body: RaidBattleBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.raidService.battle(user['user-id'], body.bossId, body.difficulty)
  }

  @AuthUser()
  @Post('exchange')
  async exchange(@Body() body: RaidExchangeBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.raidService.exchange(user['user-id'], body.bossId, body.slot, body.grade)
  }
}
