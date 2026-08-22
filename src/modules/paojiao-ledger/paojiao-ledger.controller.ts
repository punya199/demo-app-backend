import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common'
import { AuthUserWithUsername } from '../auth/auth.decorator'
import { AddLedgerEntryDto } from './dto/add-ledger-entry.dto'
import { AddLedgerItemDto } from './dto/add-ledger-item.dto'
import { AddLedgerWageDto } from './dto/add-ledger-wage.dto'
import { AddLedgerWithdrawalDto } from './dto/add-ledger-withdrawal.dto'
import { EditLedgerEntryDto } from './dto/edit-ledger-entry.dto'
import { EditLedgerItemDto } from './dto/edit-ledger-item.dto'
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
  @Put('entries/:row')
  editEntry(@Param('row', ParseIntPipe) row: number, @Body() dto: EditLedgerEntryDto) {
    return this.paojiaoLedgerService.editEntry(row, dto)
  }

  @AuthUserWithUsername(LEDGER_ALLOWED_USERNAMES)
  @Delete('entries/:row')
  deleteEntry(@Param('row', ParseIntPipe) row: number) {
    return this.paojiaoLedgerService.deleteEntry(row)
  }

  @AuthUserWithUsername(LEDGER_ALLOWED_USERNAMES)
  @Post('wages')
  addWage(@Body() dto: AddLedgerWageDto) {
    return this.paojiaoLedgerService.addWage(dto)
  }

  @AuthUserWithUsername(LEDGER_ALLOWED_USERNAMES)
  @Post('withdrawals')
  addWithdrawal(@Body() dto: AddLedgerWithdrawalDto) {
    return this.paojiaoLedgerService.addWithdrawal(dto)
  }

  @AuthUserWithUsername(LEDGER_ALLOWED_USERNAMES)
  @Get('items')
  listItems() {
    return this.paojiaoLedgerService.listItems()
  }

  @AuthUserWithUsername(LEDGER_ALLOWED_USERNAMES)
  @Post('items')
  addItem(@Body() dto: AddLedgerItemDto) {
    return this.paojiaoLedgerService.addItem(dto)
  }

  @AuthUserWithUsername(LEDGER_ALLOWED_USERNAMES)
  @Put('items/:id')
  renameItem(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EditLedgerItemDto) {
    return this.paojiaoLedgerService.renameItem(id, dto)
  }

  @AuthUserWithUsername(LEDGER_ALLOWED_USERNAMES)
  @Delete('items/:id')
  deleteItem(@Param('id', ParseUUIDPipe) id: string) {
    return this.paojiaoLedgerService.deleteItem(id)
  }
}
