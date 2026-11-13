import { Controller, Param, Post, UseGuards } from '@nestjs/common'
import { AuthUser, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import { TdStageIdParamDto } from './dto/td-stage-id-param.dto'
import { tdRateLimitGuard } from './td-rate-limit.guard'
import { TdSweepService } from './td-sweep.service'

@Controller('td/stages')
export class TdSweepController {
  constructor(private readonly sweepService: TdSweepService) {}

  @UseGuards(tdRateLimitGuard)
  @AuthUser()
  @Post(':id/sweep')
  sweep(@ReqUser() user: IAppJwtPayload, @Param() params: TdStageIdParamDto) {
    return this.sweepService.sweep(user['user-id'], params.id)
  }
}
