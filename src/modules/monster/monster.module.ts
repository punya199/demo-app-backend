import { Module } from '@nestjs/common'
import { MonsterAdventureModule } from './adventure/adventure.module'
import { MonsterArenaModule } from './arena/arena.module'
import { MonsterBossModule } from './boss/boss.module'
import { MonsterCoreModule } from './core/core.module'
import { MonsterEquipmentModule } from './equipment/equipment.module'
import { MonsterFarmModule } from './farm/farm.module'
import { MonsterInventoryModule } from './inventory/inventory.module'
import { MonsterMarketModule } from './market/market.module'
import { MonsterPassiveModule } from './passive/passive.module'
import { MonsterSocialModule } from './social/social.module'

// Aggregate of the per-feature modules; app.module only imports this one.
@Module({
  imports: [
    MonsterCoreModule,
    MonsterInventoryModule,
    MonsterAdventureModule,
    MonsterEquipmentModule,
    MonsterArenaModule,
    MonsterBossModule,
    MonsterPassiveModule,
    MonsterSocialModule,
    MonsterFarmModule,
    MonsterMarketModule,
  ],
})
export class MonsterModule {}
