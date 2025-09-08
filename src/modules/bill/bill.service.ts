// user.service.ts
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BillEntity } from '../../db/entities/bill.entity'
import { BillDto } from './dto/save-bill.dto'

@Injectable()
export class BillService {
  constructor(
    @InjectRepository(BillEntity)
    private billRepo: Repository<BillEntity>
  ) {}

  async saveBill(dto: BillDto) {
    const bill = this.billRepo.create({
      items: dto.items,
      friends: dto.friends,
      title: dto.title,
    })
    const res = await this.billRepo.save(bill)

    return {
      bilId: res.id,
    }
  }

  async getBills() {
    const bills = await this.billRepo.find({
      order: {
        createdAt: 'ASC',
      },
    })
    return { bills }
  }

  async getBill(billId: string) {
    const bill = await this.billRepo.findOneBy({ id: billId })
    return { bill }
  }

  async editBill(billId: string, dto: BillDto) {
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

  async deleteBill(billId: string) {
    await this.billRepo.softDelete({
      id: billId,
    })
  }
}
