// user.controller.ts
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common'
import { AuthUser } from '../auth/auth.decorator'
import { BillService } from './bill.service'
import { BillDto } from './dto/save-bill.dto'

@Controller('bills')
export class BillController {
  constructor(private readonly billService: BillService) {}

  @AuthUser()
  @Post()
  saveBill(@Body() dto: BillDto) {
    return this.billService.saveBill(dto)
  }

  @Get(':billId')
  getBill(@Param('billId', ParseUUIDPipe) billId: string) {
    return this.billService.getBill(billId)
  }

  @Get()
  getBills() {
    return this.billService.getBills()
  }

  @AuthUser()
  @Put(':billId')
  editBill(@Param('billId', ParseUUIDPipe) billId: string, @Body() dto: BillDto) {
    return this.billService.editBill(billId, dto)
  }

  @AuthUser()
  @Delete(':billId')
  deleteBill(@Param('billId', ParseUUIDPipe) billId: string) {
    return this.billService.deleteBill(billId)
  }
}
