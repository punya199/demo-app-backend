// user.service.ts
import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Bill } from './bill.entity'
import { BillDto } from './dto/save-bill.dto'

@Injectable()
export class BillService {
  constructor(
    @InjectRepository(Bill)
    private billRepo: Repository<Bill>,
    private jwtService: JwtService
  ) {}

  async saveBill(dto: BillDto) {
    const bill = this.billRepo.create({
      items: dto.items,
      friends: dto.friends,
      title: dto.title,
    })
    await this.billRepo.save(bill)
  }

  async getBills() {
    const bills = await this.billRepo.find()
    return { bills }
  }

  async getBill(billId: number) {
    const bill = await this.billRepo.findOneBy({ id: billId })
    return { bill }
  }

  async editBill(billId: number, dto: BillDto) {
    const bill = await this.billRepo.findOneBy({ id: billId })
    if (bill) {
      await this.billRepo.update(
        {
          id: billId,
        },
        dto
      )
      return { billId }
    }
  }
}
