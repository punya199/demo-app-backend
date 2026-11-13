import { Module } from '@nestjs/common'
import { TdBattleController } from './td-battle.controller'
import { TdBattleService } from './td-battle.service'
import { TdCoreController } from './td-core.controller'
import { TdCoreService } from './td-core.service'
import { TdGachaController } from './td-gacha.controller'
import { TdGachaService } from './td-gacha.service'
import { TdGearController } from './td-gear.controller'
import { TdGoalsController } from './td-goals.controller'
import { TdGoalsService } from './td-goals.service'
import { TdHeroController } from './td-hero.controller'
import { TdStageController } from './td-stage.controller'
import { TdSweepController } from './td-sweep.controller'
import { TdSweepService } from './td-sweep.service'
import { TdProfileController } from './td-profile.controller'
import { TdProfileService } from './td-profile.service'
import { TdRelicController } from './td-relic.controller'
import { TdRelicService } from './td-relic.service'

@Module({
  controllers: [
    TdProfileController,
    TdGachaController,
    TdBattleController,
    TdHeroController,
    TdGearController,
    TdStageController,
    TdGoalsController,
    TdCoreController,
    TdRelicController,
    TdSweepController,
  ],
  providers: [
    TdProfileService,
    TdGachaService,
    TdBattleService,
    TdGoalsService,
    TdCoreService,
    TdRelicService,
    TdSweepService,
  ],
  exports: [
    TdProfileService,
    TdGachaService,
    TdBattleService,
    TdGoalsService,
    TdCoreService,
    TdRelicService,
  ],
})
export class TdModule {}
