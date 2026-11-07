import { Module } from '@nestjs/common'
import { WalletModule } from '../../wallet/wallet.module'
import { MonsterCoreModule } from '../core/core.module'
import { PassiveController } from './passive.controller'
import { PassiveService } from './passive.service'
import { SkillController } from './skill.controller'
import { SkillService } from './skill.service'

@Module({
  imports: [MonsterCoreModule, WalletModule],
  controllers: [PassiveController, SkillController],
  providers: [PassiveService, SkillService],
})
export class MonsterPassiveModule {}
