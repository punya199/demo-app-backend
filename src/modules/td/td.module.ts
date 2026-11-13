import { Module } from '@nestjs/common'
import { TdBattleController } from './td-battle.controller'
import { TdBattleService } from './td-battle.service'
import { TdGachaController } from './td-gacha.controller'
import { TdGachaService } from './td-gacha.service'
import { TdGearController } from './td-gear.controller'
import { TdHeroController } from './td-hero.controller'
import { TdStageController } from './td-stage.controller'
import { TdProfileController } from './td-profile.controller'
import { TdProfileService } from './td-profile.service'

@Module({
  controllers: [
    TdProfileController,
    TdGachaController,
    TdBattleController,
    TdHeroController,
    TdGearController,
    TdStageController,
  ],
  providers: [TdProfileService, TdGachaService, TdBattleService],
  exports: [TdProfileService, TdGachaService, TdBattleService],
})
export class TdModule {}
