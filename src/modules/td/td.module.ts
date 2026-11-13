import { Module } from '@nestjs/common'
import { TdBattleController } from './td-battle.controller'
import { TdBattleService } from './td-battle.service'
import { TdGachaController } from './td-gacha.controller'
import { TdGachaService } from './td-gacha.service'
import { TdProfileController } from './td-profile.controller'
import { TdProfileService } from './td-profile.service'

@Module({
  controllers: [TdProfileController, TdGachaController, TdBattleController],
  providers: [TdProfileService, TdGachaService, TdBattleService],
  exports: [TdProfileService, TdGachaService, TdBattleService],
})
export class TdModule {}
