import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { MonsterEntity } from '../../db/entities/monster.entity'
import { MonsterLogEntity } from '../../db/entities/monster-log.entity'
import { WalletModule } from '../wallet/wallet.module'
import { AdventureController } from './adventure.controller'
import { AdventureService } from './adventure.service'
import { CraftController } from './craft.controller'
import { CraftService } from './craft.service'
import { CostumeController } from './costume.controller'
import { CostumeService } from './costume.service'
import { EnhanceService } from './enhance.service'
import { EquipmentController } from './equipment.controller'
import { EquipmentService } from './equipment.service'
import { ExpeditionController } from './expedition.controller'
import { ExpeditionService } from './expedition.service'
import { InventoryController } from './inventory.controller'
import { InventoryService } from './inventory.service'
import { MonsterController } from './monster.controller'
import { MonsterService } from './monster.service'
import { FriendController } from './friend.controller'
import { FriendService } from './friend.service'
import { PassiveController } from './passive.controller'
import { PassiveService } from './passive.service'
import { ProfileController } from './profile.controller'
import { ProfileService } from './profile.service'
import { SupportController } from './support.controller'
import { SupportService } from './support.service'
import { WorldBossController } from './world-boss.controller'
import { WorldBossService } from './world-boss.service'
import { RaidController } from './raid.controller'
import { RaidService } from './raid.service'
import { PvpController } from './pvp.controller'
import { PvpService } from './pvp.service'
import { QuestController } from './quest.controller'
import { QuestService } from './quest.service'
import { ShopController } from './shop.controller'
import { ShopService } from './shop.service'
import { SkillController } from './skill.controller'
import { SkillService } from './skill.service'

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
    RaidController,
    WorldBossController,
    ProfileController,
    FriendController,
    SupportController,
    PassiveController,
    CostumeController,
    SkillController,
    CraftController,
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
    RaidService,
    WorldBossService,
    ProfileService,
    FriendService,
    SupportService,
    PassiveService,
    CostumeService,
    SkillService,
    CraftService,
  ],
})
export class MonsterModule {}
