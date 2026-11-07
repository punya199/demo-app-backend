import { Module } from '@nestjs/common'
import { WalletModule } from '../../wallet/wallet.module'
import { MonsterCoreModule } from '../core/core.module'
import { MonsterInventoryModule } from '../inventory/inventory.module'
import { AdventureController } from './adventure.controller'
import { AdventureService } from './adventure.service'
import { ExpeditionController } from './expedition.controller'
import { ExpeditionService } from './expedition.service'
import { QuestController } from './quest.controller'
import { QuestService } from './quest.service'

@Module({
  imports: [MonsterCoreModule, MonsterInventoryModule, WalletModule],
  controllers: [AdventureController, QuestController, ExpeditionController],
  providers: [AdventureService, QuestService, ExpeditionService],
})
export class MonsterAdventureModule {}
