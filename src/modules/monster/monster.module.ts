import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { MonsterEntity } from '../../db/entities/monster.entity'
import { MonsterLogEntity } from '../../db/entities/monster-log.entity'
import { WalletModule } from '../wallet/wallet.module'
import { AdventureController } from './adventure.controller'
import { AdventureService } from './adventure.service'
import { EnhanceService } from './enhance.service'
import { EquipmentController } from './equipment.controller'
import { EquipmentService } from './equipment.service'
import { ExpeditionController } from './expedition.controller'
import { ExpeditionService } from './expedition.service'
import { InventoryController } from './inventory.controller'
import { InventoryService } from './inventory.service'
import { MonsterController } from './monster.controller'
import { MonsterService } from './monster.service'
import { PvpController } from './pvp.controller'
import { PvpService } from './pvp.service'
import { QuestController } from './quest.controller'
import { QuestService } from './quest.service'
import { ShopController } from './shop.controller'
import { ShopService } from './shop.service'

@Module({
  imports: [TypeOrmModule.forFeature([MonsterEntity, MonsterLogEntity]), WalletModule],
  controllers: [
    MonsterController,
    AdventureController,
    ShopController,
    InventoryController,
    QuestController,
    ExpeditionController,
    EquipmentController,
    PvpController,
  ],
  providers: [
    MonsterService,
    AdventureService,
    ShopService,
    InventoryService,
    QuestService,
    ExpeditionService,
    EquipmentService,
    EnhanceService,
    PvpService,
  ],
})
export class MonsterModule {}
