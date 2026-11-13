import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { AuthUser, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import { TdGachaPullDto } from './dto/td-gacha-pull.dto'
import { TdGachaService } from './td-gacha.service'
import { TdRateLimitGuard } from './td-rate-limit.guard'

@Controller('td/gacha')
export class TdGachaController {
  constructor(private readonly gachaService: TdGachaService) {}

  // Guards run in decorator order bottom-up: JWT first, then the per-user limit.
  @UseGuards(new TdRateLimitGuard())
  @AuthUser()
  @Get()
  getGacha(@ReqUser() user: IAppJwtPayload) {
    return this.gachaService.getGacha(user['user-id'])
  }

  @UseGuards(new TdRateLimitGuard())
  @AuthUser()
  @Post('pull')
  pull(@ReqUser() user: IAppJwtPayload, @Body() dto: TdGachaPullDto) {
    return this.gachaService.pull(user['user-id'], dto.mode)
  }
}
