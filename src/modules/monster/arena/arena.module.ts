import { Module } from '@nestjs/common'
import { WalletModule } from '../../wallet/wallet.module'
import { MonsterCoreModule } from '../core/core.module'
import { DummyController } from './dummy.controller'
import { DummyService } from './dummy.service'
import { PvpController } from './pvp.controller'
import { PvpService } from './pvp.service'

@Module({
  imports: [MonsterCoreModule, WalletModule],
  controllers: [PvpController, DummyController],
  providers: [PvpService, DummyService],
})
export class MonsterArenaModule {}
