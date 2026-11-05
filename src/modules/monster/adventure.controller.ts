import { Body, Controller, Get, Post } from '@nestjs/common'
import { AuthUser, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import { AdventureService } from './adventure.service'
import { AdventureBattleBodyDto, AdventureSkipBodyDto } from './dto/adventure-battle.dto'

@Controller('adventure')
export class AdventureController {
  constructor(private readonly adventureService: AdventureService) {}

  @AuthUser()
  @Get()
  async getAdventure(@ReqUser() user: IAppJwtPayload) {
    return this.adventureService.getAdventure(user['user-id'])
  }

  @AuthUser()
  @Post('battle')
  async battle(@Body() body: AdventureBattleBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.adventureService.battle(user['user-id'], body.stageId)
  }

  @AuthUser()
  @Post('skip')
  async skip(@Body() body: AdventureSkipBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.adventureService.skip(user['user-id'], body.stageId, body.runs)
  }
}
