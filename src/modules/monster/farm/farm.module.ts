import { Module } from '@nestjs/common'
import { WalletModule } from '../../wallet/wallet.module'
import { MonsterCoreModule } from '../core/core.module'
import { MonsterInventoryModule } from '../inventory/inventory.module'
import { FarmController } from './farm.controller'
import { FarmService } from './farm.service'

@Module({
  imports: [MonsterCoreModule, MonsterInventoryModule, WalletModule],
  controllers: [FarmController],
  providers: [FarmService],
})
export class MonsterFarmModule {}
