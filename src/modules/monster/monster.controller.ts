import { Body, Controller, Get, Post } from '@nestjs/common'
import { AuthUser, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import { HatchMonsterBodyDto } from './dto/hatch-monster.dto'
import { MonsterActionBodyDto } from './dto/monster-action.dto'
import { SelectMonsterBodyDto } from './dto/select-monster.dto'
import { MonsterService } from './monster.service'
import { buildWiki } from './wiki'

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
  @Post('select')
  async select(@Body() body: SelectMonsterBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.monsterService.select(user['user-id'], body.monsterId)
  }

  @AuthUser()
  @Post('action')
  async act(@Body() body: MonsterActionBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.monsterService.act(user['user-id'], body.type, body.monsterId)
  }

  @AuthUser()
  @Get('wiki')
  getWiki() {
    return buildWiki()
  }

  @AuthUser()
  @Get('dex')
  async getDex(@ReqUser() user: IAppJwtPayload) {
    return this.monsterService.getDex(user['user-id'])
  }

  @AuthUser()
  @Get('history')
  async getHistory(@ReqUser() user: IAppJwtPayload) {
    return this.monsterService.getHistory(user['user-id'])
  }
}
