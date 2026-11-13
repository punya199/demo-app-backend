import { Controller, Param, Post, UseGuards } from '@nestjs/common'
import { AuthUser, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import { TdHeroIdParamDto } from './dto/td-hero-id-param.dto'
import { TdGachaService } from './td-gacha.service'
import { tdRateLimitGuard } from './td-rate-limit.guard'

@Controller('td/gear')
export class TdGearController {
  constructor(private readonly gachaService: TdGachaService) {}

  // :id is the hero id (validated against the known heroes). Guards run bottom-up: JWT, then the
  // per-user limit.
  @UseGuards(tdRateLimitGuard)
  @AuthUser()
  @Post(':id/upgrade')
  upgrade(@ReqUser() user: IAppJwtPayload, @Param() params: TdHeroIdParamDto) {
    return this.gachaService.upgradeGear(user['user-id'], params.id)
  }
}
