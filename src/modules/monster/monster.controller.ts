import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import { AuthUser, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import { HatchMonsterBodyDto } from './dto/hatch-monster.dto'
import { MergeMonstersBodyDto } from './dto/merge-monsters.dto'
import { MinigameBodyDto, StaminaRefillBodyDto } from './dto/minigame.dto'
import { MonsterActionBodyDto } from './dto/monster-action.dto'
import { RenameMonsterBodyDto } from './dto/rename-monster.dto'
import { ReturnHomeBodyDto } from './dto/return-home.dto'
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
  @Post('rename')
  async rename(@Body() body: RenameMonsterBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.monsterService.rename(user['user-id'], body.monsterId, body.name)
  }

  @AuthUser()
  @Post('select')
  async select(@Body() body: SelectMonsterBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.monsterService.select(user['user-id'], body.monsterId)
  }

  @AuthUser()
  @Post('merge')
  async merge(@Body() body: MergeMonstersBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.monsterService.merge(user['user-id'], body.firstId, body.secondId, body.baseId)
  }

  @AuthUser()
  @Post('return-home')
  async returnHome(@Body() body: ReturnHomeBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.monsterService.returnHome(user['user-id'], body.monsterId)
  }

  @AuthUser()
  @Post('action')
  async act(@Body() body: MonsterActionBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.monsterService.act(user['user-id'], body.type, body.monsterId)
  }

  @AuthUser()
  @Post('minigame')
  async playMinigame(@Body() body: MinigameBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.monsterService.playMinigame(user['user-id'], body.hits, body.monsterId)
  }

  @AuthUser()
  @Post('stamina/refill')
  async refillStamina(@Body() body: StaminaRefillBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.monsterService.refillStamina(user['user-id'], body.monsterId)
  }

  @AuthUser()
  @Get(':monsterId/evolution-path')
  async getEvolutionPath(
    @Param('monsterId', ParseUUIDPipe) monsterId: string,
    @ReqUser() user: IAppJwtPayload
  ) {
    return this.monsterService.getEvolutionPath(user['user-id'], monsterId)
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
