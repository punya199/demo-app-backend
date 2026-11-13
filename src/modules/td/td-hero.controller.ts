import { Controller, Param, Post, UseGuards } from '@nestjs/common'
import { AuthUser, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import { TdHeroIdParamDto } from './dto/td-hero-id-param.dto'
import { TdGachaService } from './td-gacha.service'
import { TdRateLimitGuard } from './td-rate-limit.guard'

@Controller('td/heroes')
export class TdHeroController {
  constructor(private readonly gachaService: TdGachaService) {}

  // Guards run in decorator order bottom-up: JWT first, then the per-user limit.
  @UseGuards(new TdRateLimitGuard())
  @AuthUser()
  @Post(':id/star-up')
  starUp(@ReqUser() user: IAppJwtPayload, @Param() params: TdHeroIdParamDto) {
    return this.gachaService.starUp(user['user-id'], params.id)
  }
}
