import { Body, Controller, Get, Post } from '@nestjs/common'
import { AuthUser, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import { StartExpeditionBodyDto } from './dto/start-expedition.dto'
import { ExpeditionService } from './expedition.service'

@Controller('expedition')
export class ExpeditionController {
  constructor(private readonly expeditionService: ExpeditionService) {}

  @AuthUser()
  @Get()
  async getExpedition(@ReqUser() user: IAppJwtPayload) {
    return this.expeditionService.getExpedition(user['user-id'])
  }

  @AuthUser()
  @Post('start')
  async start(@Body() body: StartExpeditionBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.expeditionService.start(user['user-id'], body.areaId)
  }

  @AuthUser()
  @Post('claim')
  async claim(@ReqUser() user: IAppJwtPayload) {
    return this.expeditionService.claim(user['user-id'])
  }
}
