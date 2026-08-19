import { Body, Controller, Get, Post } from '@nestjs/common'
import { AuthUserWithUsername } from '../auth/auth.decorator'
import { AddLedgerEntryDto } from './dto/add-ledger-entry.dto'
import { AddLedgerWageDto } from './dto/add-ledger-wage.dto'
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

  @AuthUserWithUsername(LEDGER_ALLOWED_USERNAMES)
  @Post('entries')
  addEntry(@Body() dto: AddLedgerEntryDto) {
    return this.paojiaoLedgerService.addEntry(dto)
  }

  @AuthUserWithUsername(LEDGER_ALLOWED_USERNAMES)
  @Post('wages')
  addWage(@Body() dto: AddLedgerWageDto) {
    return this.paojiaoLedgerService.addWage(dto)
  }
}
