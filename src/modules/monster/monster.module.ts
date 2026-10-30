import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { MonsterEntity } from '../../db/entities/monster.entity'
import { MonsterLogEntity } from '../../db/entities/monster-log.entity'
import { WalletModule } from '../wallet/wallet.module'
import { AdventureController } from './adventure.controller'
import { AdventureService } from './adventure.service'
import { MonsterController } from './monster.controller'
import { MonsterService } from './monster.service'
import { ShopController } from './shop.controller'
import { ShopService } from './shop.service'

@Module({
  imports: [TypeOrmModule.forFeature([MonsterEntity, MonsterLogEntity]), WalletModule],
  controllers: [MonsterController, AdventureController, ShopController],
  providers: [MonsterService, AdventureService, ShopService],
})
export class MonsterModule {}
