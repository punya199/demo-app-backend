import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { AuthUser, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import { TdRelicIdParamDto } from './dto/td-relic-id-param.dto'
import { TdRelicService } from './td-relic.service'
import { tdRateLimitGuard } from './td-rate-limit.guard'

@Controller('td/relics')
export class TdRelicController {
  constructor(private readonly relicService: TdRelicService) {}

  // Guards run bottom-up: JWT first, then the per-user limit.
  @UseGuards(tdRateLimitGuard)
  @AuthUser()
  @Get()
  list(@ReqUser() user: IAppJwtPayload) {
    return this.relicService.list(user['user-id'])
  }

  @UseGuards(tdRateLimitGuard)
  @AuthUser()
  @Post(':id/unlock')
  unlock(@ReqUser() user: IAppJwtPayload, @Param() params: TdRelicIdParamDto) {
    return this.relicService.unlock(user['user-id'], params.id)
  }
}
