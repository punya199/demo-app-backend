import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { AuthUser, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import { TdCoreEquipDto } from './dto/td-core-equip.dto'
import { TdCoreIdParamDto } from './dto/td-core-id-param.dto'
import { TdCoreService } from './td-core.service'
import { tdRateLimitGuard } from './td-rate-limit.guard'

@Controller('td/cores')
export class TdCoreController {
  constructor(private readonly coreService: TdCoreService) {}

  // Guards run bottom-up: JWT first, then the per-user limit.
  @UseGuards(tdRateLimitGuard)
  @AuthUser()
  @Get()
  list(@ReqUser() user: IAppJwtPayload) {
    return this.coreService.list(user['user-id'])
  }

  @UseGuards(tdRateLimitGuard)
  @AuthUser()
  @Post(':id/equip')
  equip(
    @ReqUser() user: IAppJwtPayload,
    @Param() params: TdCoreIdParamDto,
    @Body() dto: TdCoreEquipDto
  ) {
    return this.coreService.equip(user['user-id'], params.id, dto.slot)
  }

  @UseGuards(tdRateLimitGuard)
  @AuthUser()
  @Post(':id/promote')
  promote(@ReqUser() user: IAppJwtPayload, @Param() params: TdCoreIdParamDto) {
    return this.coreService.promote(user['user-id'], params.id)
  }
}
