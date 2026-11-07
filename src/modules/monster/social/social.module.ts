import { Module } from '@nestjs/common'
import { MonsterCoreModule } from '../core/core.module'
import { MonsterInventoryModule } from '../inventory/inventory.module'
import { FriendController } from './friend.controller'
import { FriendService } from './friend.service'
import { SupportController } from './support.controller'
import { SupportService } from './support.service'

@Module({
  imports: [MonsterCoreModule, MonsterInventoryModule],
  controllers: [FriendController, SupportController],
  providers: [FriendService, SupportService],
})
export class MonsterSocialModule {}
