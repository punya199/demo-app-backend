import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { LedgerItemEntity } from '../../db/entities/ledger-item.entity'
import { PaojiaoLedgerController } from './paojiao-ledger.controller'
import { PaojiaoLedgerService } from './paojiao-ledger.service'

@Module({
  imports: [TypeOrmModule.forFeature([LedgerItemEntity])],
  controllers: [PaojiaoLedgerController],
  providers: [PaojiaoLedgerService],
})
export class PaojiaoLedgerModule {}
