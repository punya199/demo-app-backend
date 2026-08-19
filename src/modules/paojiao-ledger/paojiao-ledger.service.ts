import { Injectable } from '@nestjs/common'
import { LEDGER_DATA } from './paojiao-ledger-data'
import { LedgerData } from './paojiao-ledger.interface'

// Phase A: reads a static snapshot. Phase B swaps this for a Google Sheets read,
// keeping the same LedgerData shape so the controller/frontend contract doesn't change.
@Injectable()
export class PaojiaoLedgerService {
  getLedger(): LedgerData {
    return LEDGER_DATA
  }
}
