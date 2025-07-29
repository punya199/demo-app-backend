import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository } from 'typeorm'
import { AttachmentEntity } from '../../entities/attachment.entity'
import { HouseRentEntity } from '../../entities/house-rent'
import { HouseRentDetailEntity } from '../../entities/house-rent-detail.entity'
import { HouseRentMemberEntity } from '../../entities/house-rent-member.entity'
import { CreateHouseRentBodyDto } from './dto/create-house-rent.dto'
import { EditHouseRentBodyDto } from './dto/edit-house-rent.dto'

@Injectable()
export class HouseRentService {
  constructor(
    @InjectRepository(HouseRentEntity)
    private readonly houseRentRepository: Repository<HouseRentEntity>,
    @InjectRepository(HouseRentDetailEntity)
    private readonly houseRentDetailRepository: Repository<HouseRentDetailEntity>,
    @InjectRepository(HouseRentMemberEntity)
    private readonly houseRentMemberRepository: Repository<HouseRentMemberEntity>,
    @InjectRepository(AttachmentEntity)
    private readonly attachmentRepository: Repository<AttachmentEntity>
  ) {}

  async createHouseRent(params: CreateHouseRentBodyDto, etm: EntityManager) {
    const existingHouseRent = await etm.findOne(HouseRentEntity, {
      where: {
        name: params.name,
      },
    })

    if (existingHouseRent) {
      throw new BadRequestException('House rent same name already exists')
    }

    const houseRent = await etm.save(HouseRentEntity, {
      name: params.name,
      baseHouseRent: params.baseHouseRent,
      paymentFee: params.paymentFee,
      internet: params.internet,
      airCondition: params.airCondition,
      rents: params.rents,
    })

    if (params.rents?.length) {
      await etm.save(
        HouseRentDetailEntity,
        params.rents.map(rent => ({
          month: rent.month,
          houseRentPrice: rent.houseRentPrice,
          waterPrice: rent.waterPrice,
          electricity: rent.electricity,
          houseRentId: houseRent.id,
        }))
      )
    } else {
      await etm.softDelete(HouseRentDetailEntity, { houseRentId: houseRent.id })
    }

    if (params.members?.length) {
      await etm.save(
        HouseRentMemberEntity,
        params.members.map(member => ({
          name: member.name,
          houseRentId: houseRent.id,
          airConditionUnit: member.airConditionUnit,
          electricityUnit: member.electricityUnit,
          payInternetMonthIds: member.payInternetMonthIds,
          payElectricityMonthIds: member.payElectricityMonthIds,
        }))
      )
    } else {
      await etm.softDelete(HouseRentMemberEntity, { houseRentId: houseRent.id })
    }

    // const attachments = await this.attachmentRepository.save(params.attachments)
    return { houseRent }
  }

  async updateHouseRent(houseRentId: string, params: EditHouseRentBodyDto, etm: EntityManager) {
    const houseRent = await etm.update(HouseRentEntity, houseRentId, {
      name: params.name,
    })
    if (params.rents?.length) {
      await etm.save(
        HouseRentDetailEntity,
        params.rents.map(rent => ({
          id: rent.id,
          month: rent.month,
          houseRentPrice: rent.houseRentPrice,
          waterPrice: rent.waterPrice,
          electricity: rent.electricity,
          houseRentId: houseRentId,
        }))
      )
    } else {
      await etm.softDelete(HouseRentDetailEntity, { houseRentId })
    }

    if (params.members?.length) {
      await etm.save(
        HouseRentMemberEntity,
        params.members.map(member => ({
          id: member.id,
          name: member.name,
          houseRentId: houseRentId,
        }))
      )
    } else {
      await etm.softDelete(HouseRentMemberEntity, { houseRentId })
    }

    return { houseRent }
  }

  async getHouseRent(houseRentId: string) {
    const houseRent = await this.houseRentRepository.findOne({
      where: { id: houseRentId },
      relations: ['rents', 'members'],
    })

    return {
      houseRent,
    }
  }

  async getHouseRents() {
    const houseRents = await this.houseRentRepository.find({
      relations: ['rents', 'members'],
    })

    return {
      houseRents,
    }
  }
}
