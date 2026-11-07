import { Module } from '@nestjs/common'
import { WalletModule } from '../../wallet/wallet.module'
import { MonsterCoreModule } from '../core/core.module'
import { MonsterInventoryModule } from '../inventory/inventory.module'
import { RaidController } from './raid.controller'
import { RaidService } from './raid.service'
import { WorldBossController } from './world-boss.controller'
import { WorldBossService } from './world-boss.service'

@Module({
  imports: [MonsterCoreModule, MonsterInventoryModule, WalletModule],
  controllers: [RaidController, WorldBossController],
  providers: [RaidService, WorldBossService],
})
export class MonsterBossModule {}
