import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BillEntity } from '../../entities/bill.entity'
import { BillController } from './bill.controller'
import { BillService } from './bill.service'

@Module({
  imports: [TypeOrmModule.forFeature([BillEntity])],
  providers: [BillService],
  controllers: [BillController],
})
export class BillModule {}
