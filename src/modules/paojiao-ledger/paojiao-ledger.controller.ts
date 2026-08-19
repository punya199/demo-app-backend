import { Controller, Get } from '@nestjs/common'
import { AuthUserWithUsername } from '../auth/auth.decorator'
import { PaojiaoLedgerService } from './paojiao-ledger.service'

// Restricted to specific named accounts, regardless of role - this is a family member's
// private ledger, not a role-level feature. 'test' is a throwaway account the owner
// created so this feature can be verified before going live.
const LEDGER_ALLOWED_USERNAMES = ['punya', 'test']

@Controller('paojiao-ledger')
export class PaojiaoLedgerController {
  constructor(private readonly paojiaoLedgerService: PaojiaoLedgerService) {}

  @AuthUserWithUsername(LEDGER_ALLOWED_USERNAMES)
  @Get()
  getLedger() {
    return this.paojiaoLedgerService.getLedger()
  }
}
