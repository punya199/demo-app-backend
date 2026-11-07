import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { MonsterEntity } from '../../../db/entities/monster.entity'
import { MonsterLogEntity } from '../../../db/entities/monster-log.entity'
import { WalletModule } from '../../wallet/wallet.module'
import { MonsterController } from './monster.controller'
import { MonsterService } from './monster.service'
import { ProfileController } from './profile.controller'
import { ProfileService } from './profile.service'

@Module({
  imports: [TypeOrmModule.forFeature([MonsterEntity, MonsterLogEntity]), WalletModule],
  controllers: [MonsterController, ProfileController],
  providers: [MonsterService, ProfileService],
  exports: [MonsterService, ProfileService],
})
export class MonsterCoreModule {}
