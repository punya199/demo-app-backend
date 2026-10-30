import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { MonsterEntity } from '../../db/entities/monster.entity'
import { MonsterLogEntity } from '../../db/entities/monster-log.entity'
import { MonsterController } from './monster.controller'
import { MonsterService } from './monster.service'

@Module({
  imports: [TypeOrmModule.forFeature([MonsterEntity, MonsterLogEntity])],
  controllers: [MonsterController],
  providers: [MonsterService],
})
export class MonsterModule {}
