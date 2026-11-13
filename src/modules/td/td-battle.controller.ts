import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { AuthUser, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import { TdBattleFinishDto } from './dto/td-battle-finish.dto'
import { TdBattleStartDto } from './dto/td-battle-start.dto'
import { TdBattleService } from './td-battle.service'
import { TdRateLimitGuard } from './td-rate-limit.guard'

@Controller('td/battles')
export class TdBattleController {
  constructor(private readonly battleService: TdBattleService) {}

  // Guards run in decorator order bottom-up: JWT first, then the per-user limit.
  @UseGuards(new TdRateLimitGuard())
  @AuthUser()
  @Post()
  start(@ReqUser() user: IAppJwtPayload, @Body() dto: TdBattleStartDto) {
    return this.battleService.start(user['user-id'], dto.stageId)
  }

  @UseGuards(new TdRateLimitGuard())
  @AuthUser()
  @Post(':id/finish')
  finish(
    @ReqUser() user: IAppJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TdBattleFinishDto
  ) {
    return this.battleService.finish(user['user-id'], id, dto)
  }
}
