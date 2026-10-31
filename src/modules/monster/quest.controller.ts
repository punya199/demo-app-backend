import { Body, Controller, Get, Post } from '@nestjs/common'
import { AuthUser, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import { ClaimQuestBodyDto } from './dto/claim-quest.dto'
import { QuestService } from './quest.service'

@Controller('quests')
export class QuestController {
  constructor(private readonly questService: QuestService) {}

  @AuthUser()
  @Get()
  async getQuests(@ReqUser() user: IAppJwtPayload) {
    return this.questService.getQuests(user['user-id'])
  }

  @AuthUser()
  @Post('claim')
  async claim(@Body() body: ClaimQuestBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.questService.claim(user['user-id'], body.questId)
  }
}
