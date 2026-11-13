import { Controller, Get, UseGuards } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { TdStageProgressEntity } from '../../db/entities/td/td-stage-progress.entity'
import { AuthUser, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import { stageList } from './stage'
import { STAGE_ENERGY_COST } from './energy'
import { TdRateLimitGuard } from './td-rate-limit.guard'

@Controller('td/stages')
export class TdStageController {
  constructor(private readonly dataSource: DataSource) {}

  // Stages with the caller's best stars; a stage is unlocked once the previous one is cleared.
  @UseGuards(new TdRateLimitGuard())
  @AuthUser()
  @Get()
  async list(@ReqUser() user: IAppJwtPayload) {
    const progress = await this.dataSource.manager.find(TdStageProgressEntity, {
      where: { userId: user['user-id'] },
    })
    return { energyCost: STAGE_ENERGY_COST, stages: stageList(progress) }
  }
}
