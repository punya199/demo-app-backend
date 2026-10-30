import { Body, Controller, Get, Post } from '@nestjs/common'
import { AuthUser, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import { HatchMonsterBodyDto } from './dto/hatch-monster.dto'
import { MonsterActionBodyDto } from './dto/monster-action.dto'
import { MonsterService } from './monster.service'

@Controller('monster')
export class MonsterController {
  constructor(private readonly monsterService: MonsterService) {}

  @AuthUser()
  @Get('me')
  async getMyMonster(@ReqUser() user: IAppJwtPayload) {
    return this.monsterService.getMyMonster(user['user-id'])
  }

  @AuthUser()
  @Post('hatch')
  async hatch(@Body() body: HatchMonsterBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.monsterService.hatch(user['user-id'], body.line)
  }

  @AuthUser()
  @Post('action')
  async act(@Body() body: MonsterActionBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.monsterService.act(user['user-id'], body.type)
  }

  @AuthUser()
  @Get('history')
  async getHistory(@ReqUser() user: IAppJwtPayload) {
    return this.monsterService.getHistory(user['user-id'])
  }
}
