import { Module } from '@nestjs/common'
import { PaojiaoLedgerController } from './paojiao-ledger.controller'
import { PaojiaoLedgerService } from './paojiao-ledger.service'

@Module({
  controllers: [PaojiaoLedgerController],
  providers: [PaojiaoLedgerService],
})
export class PaojiaoLedgerModule {}
