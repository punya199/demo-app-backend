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
import { EditLedgerWageDto } from './dto/edit-ledger-wage.dto'
import { EditLedgerWithdrawalDto } from './dto/edit-ledger-withdrawal.dto'
import { LedgerPerson } from './paojiao-ledger.interface'
import { PaojiaoLedgerService } from './paojiao-ledger.service'

// Restricted to specific named accounts, regardless of role - this is a family member's
// private ledger, not a role-level feature.
const LEDGER_ALLOWED_USERNAMES = ['punya']

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
  @Put('wages/:row')
  editWage(@Param('row', ParseIntPipe) row: number, @Body() dto: EditLedgerWageDto) {
    return this.paojiaoLedgerService.editWage(row, dto)
  }

  @AuthUserWithUsername(LEDGER_ALLOWED_USERNAMES)
  @Delete('wages/:row')
  deleteWage(@Param('row', ParseIntPipe) row: number) {
    return this.paojiaoLedgerService.deleteWage(row)
  }

  @AuthUserWithUsername(LEDGER_ALLOWED_USERNAMES)
  @Post('withdrawals')
  addWithdrawal(@Body() dto: AddLedgerWithdrawalDto) {
    return this.paojiaoLedgerService.addWithdrawal(dto)
  }

  // `who` isn't validated with an enum pipe here - an invalid value just won't match any
  // withdrawal, and the service throws NotFoundException for that same reason.
  @AuthUserWithUsername(LEDGER_ALLOWED_USERNAMES)
  @Put('withdrawals/:who/:row')
  editWithdrawal(
    @Param('who') who: string,
    @Param('row', ParseIntPipe) row: number,
    @Body() dto: EditLedgerWithdrawalDto
  ) {
    return this.paojiaoLedgerService.editWithdrawal(who as LedgerPerson, row, dto)
  }

  @AuthUserWithUsername(LEDGER_ALLOWED_USERNAMES)
  @Delete('withdrawals/:who/:row')
  deleteWithdrawal(@Param('who') who: string, @Param('row', ParseIntPipe) row: number) {
    return this.paojiaoLedgerService.deleteWithdrawal(who as LedgerPerson, row)
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
