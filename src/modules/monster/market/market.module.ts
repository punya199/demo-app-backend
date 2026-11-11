import { Module } from '@nestjs/common'
import { WalletModule } from '../../wallet/wallet.module'
import { MonsterCoreModule } from '../core/core.module'
import { MarketController } from './market.controller'
import { MarketService } from './market.service'

@Module({
  imports: [MonsterCoreModule, WalletModule],
  controllers: [MarketController],
  providers: [MarketService],
})
export class MonsterMarketModule {}
