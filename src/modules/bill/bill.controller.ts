// user.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'
import { JwtAuthGuard } from '../user/jwt-auth.guard'
import { BillService } from './bill.service'
import { BillDto } from './dto/save-bill.dto'

@Controller('bills')
export class BillController {
  constructor(private readonly billService: BillService) {}

  @UseGuards(JwtAuthGuard)
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

  @UseGuards(JwtAuthGuard)
  @Put(':billId')
  editBill(@Param('billId', ParseUUIDPipe) billId: string, @Body() dto: BillDto) {
    return this.billService.editBill(billId, dto)
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':billId')
  deleteBill(@Param('billId', ParseUUIDPipe) billId: string) {
    return this.billService.deleteBill(billId)
  }
}
