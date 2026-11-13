import { Module } from '@nestjs/common'
import { TdGachaController } from './td-gacha.controller'
import { TdGachaService } from './td-gacha.service'
import { TdProfileController } from './td-profile.controller'
import { TdProfileService } from './td-profile.service'

@Module({
  controllers: [TdProfileController, TdGachaController],
  providers: [TdProfileService, TdGachaService],
  exports: [TdProfileService, TdGachaService],
})
export class TdModule {}
