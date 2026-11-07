import { Module } from '@nestjs/common'
import { WalletModule } from '../../wallet/wallet.module'
import { MonsterCoreModule } from '../core/core.module'
import { MonsterInventoryModule } from '../inventory/inventory.module'
import { CostumeController } from './costume.controller'
import { CostumeService } from './costume.service'
import { CraftController } from './craft.controller'
import { CraftService } from './craft.service'
import { EnhanceService } from './enhance.service'
import { EquipmentController } from './equipment.controller'
import { EquipmentService } from './equipment.service'
import { ShopController } from './shop.controller'
import { ShopService } from './shop.service'

@Module({
  imports: [MonsterCoreModule, MonsterInventoryModule, WalletModule],
  controllers: [EquipmentController, ShopController, CostumeController, CraftController],
  providers: [EquipmentService, EnhanceService, ShopService, CostumeService, CraftService],
  exports: [EquipmentService],
})
export class MonsterEquipmentModule {}
