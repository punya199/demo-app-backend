import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { WalletEntity } from '../../db/entities/wallet.entity'
import { WalletTransactionEntity } from '../../db/entities/wallet-transaction.entity'
import { WalletController } from './wallet.controller'
import { WalletService } from './wallet.service'

@Module({
  imports: [TypeOrmModule.forFeature([WalletEntity, WalletTransactionEntity])],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
