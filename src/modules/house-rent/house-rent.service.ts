import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { chain, keyBy, round } from 'lodash'
import { EntityManager, In, Not, Repository } from 'typeorm'
import { AttachmentEntity } from '../../db/entities/attachment.entity'
import { HouseRentEntity } from '../../db/entities/house-rent'
import { HouseRentDetailEntity } from '../../db/entities/house-rent-detail.entity'
import { HouseRentMemberEntity } from '../../db/entities/house-rent-member.entity'
import { UserEntity } from '../../db/entities/user.entity'
import { CreateHouseRentBodyDto } from './dto/create-house-rent.dto'
import { EditHouseRentBodyDto } from './dto/edit-house-rent.dto'

@Injectable()
export class HouseRentService {
  constructor(
    @InjectRepository(HouseRentEntity)
    private readonly houseRentRepository: Repository<HouseRentEntity>,
    @InjectRepository(AttachmentEntity)
    private readonly attachmentRepository: Repository<AttachmentEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(HouseRentMemberEntity)
    private readonly houseRentMemberRepository: Repository<HouseRentMemberEntity>
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
          userId: member.userId,
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

    await this.updateAttachments(params, etm, houseRent.id)

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
          userId: member.userId,
          houseRentId: houseRentId,
          airConditionUnit: member.airConditionUnit,
          electricityUnit: member.electricityUnit,
          payInternetMonthIds: member.payInternetMonthIds,
          payElectricityMonthIds: member.payElectricityMonthIds,
        }))
      )
    } else {
      await etm.softDelete(HouseRentMemberEntity, { houseRentId })
    }

    await this.updateAttachments(params, etm, houseRentId)

    return { houseRent }
  }

  async getHouseRent(houseRentId: string) {
    const houseRent = await this.houseRentRepository.findOne({
      where: { id: houseRentId },
      relations: ['rents', 'members'],
    })
    const attachments = await this.attachmentRepository.find({
      where: { attachableId: houseRentId, attachableType: 'house_rent' },
      order: {
        createdAt: 'ASC',
      },
    })
    return {
      houseRent: {
        ...houseRent,
        attachments,
      },
    }
  }

  async getHouseRents() {
    const houseRents = await this.houseRentRepository.find({
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        members: {
          id: true,
          userId: true,
        },
        rents: {
          id: true,
          month: true,
          houseRentPrice: true,
          waterPrice: true,
          electricity: true,
        },
        airCondition: true,
        internet: true,
        paymentFee: true,
      },
      relations: {
        rents: true,
        members: true,
      },
      order: {
        createdAt: 'DESC',
      },
    })

    return {
      houseRents,
    }
  }

  async getHouseRentUsers() {
    const users = await this.userRepository
      .createQueryBuilder('user')
      .select('user.id')
      .addSelect('user.username')
      .innerJoin('user.houseRentMembers', 'houseRentMembers')
      .getMany()

    return { users }
  }

  async getHouseRentUser(userId: string) {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .select('user.id')
      .addSelect('user.username')
      .innerJoin('user.houseRentMembers', 'houseRentMembers')
      .where('user.id = :userId', { userId })
      .getOne()
    const houseRentMembers = await this.houseRentMemberRepository
      .createQueryBuilder('houseRentMember')
      .innerJoin('houseRentMember.houseRent', 'houseRent')
      .where('houseRentMember.userId = :userId', { userId })
      .getMany()

    const houseRents = await this.houseRentRepository
      .createQueryBuilder('houseRent')
      .innerJoinAndSelect('houseRent.rents', 'rents')
      .innerJoinAndSelect('houseRent.members', 'members')
      .where('houseRent.id IN (:...houseRentIds)', {
        houseRentIds: houseRentMembers.map(houseRentMember => houseRentMember.houseRentId),
      })
      .getMany()

    const houseRentsMap = keyBy(houseRents, 'id')

    const data = houseRentMembers.reduce((acc: unknown[], houseRentMember) => {
      const houseRent = houseRentsMap[houseRentMember.houseRentId]
      const totalMembers = houseRent?.members?.length ?? 0
      houseRent?.rents?.forEach(rent => {
        const electricityRate = round(rent.electricity.totalPrice / rent.electricity.unit, 2)
        // const isPayNet = houseRentMember.payInternetMonthIds?.includes(rent.id ?? '')
        // const isPayElectricity = houseRentMember.payElectricityMonthIds?.includes(rent.id ?? '')
        acc.push({
          group: houseRent.name,
          title: rent.month,
          airConditionPrice: round(
            houseRentMember.airConditionUnit * houseRent.airCondition.pricePerUnit,
            2
          ),
          // internetPrice: isPayNet ? houseRent.internet.pricePerMonth : 0,
          waterPrice: round(rent.waterPrice / totalMembers, 2),
          // electricityPrice: isPayElectricity ? rent.electricity.totalPrice : 0,
          electricityRate,
          individualElectricityPrice: round(
            (houseRentMember.electricityUnit.diff * electricityRate) / houseRent?.rents?.length,
            2
          ),
          electricityUnit: {
            diff: round(houseRentMember.electricityUnit.diff / houseRent?.rents?.length, 0),
            prev: houseRentMember.electricityUnit.prev,
            current: houseRentMember.electricityUnit.current,
          },
        })
      })
      return acc
    }, [])
    return { data, user }
  }

  async getHouseRentOverview() {
    const houseRents = await this.houseRentRepository
      .createQueryBuilder('houseRent')
      .innerJoinAndSelect('houseRent.rents', 'rents')
      .innerJoinAndSelect('houseRent.members', 'members')
      .innerJoinAndSelect('members.user', 'user')
      .getMany()

    const data = houseRents.reduce((acc: unknown[], houseRent) => {
      const totalMembers = houseRent?.members?.length ?? 0
      const totalRents = houseRent?.rents?.length ?? 0
      houseRent?.rents?.forEach(rent => {
        const electricityRate = round(rent.electricity.totalPrice / rent.electricity.unit, 2)
        // const isPayNet = houseRentMember.payInternetMonthIds?.includes(rent.id ?? '')
        // const isPayElectricity = houseRentMember.payElectricityMonthIds?.includes(rent.id ?? '')
        let shareElectricityUnit = chain(houseRent?.members ?? [])
          .map(member => member.electricityUnit.diff)
          .sum()
          .divide(totalRents)
          .subtract(rent.electricity.unit)
          .round(2)
          .value()
        shareElectricityUnit = Math.abs(shareElectricityUnit)

        let shareElectricityPrice = chain(shareElectricityUnit)
          .multiply(electricityRate)
          .round(2)
          .value()
        shareElectricityPrice = Math.abs(shareElectricityPrice)

        const members = houseRent?.members?.reduce((acc: Record<string, any>, member) => {
          const waterPrice = round(rent.waterPrice / totalMembers, 2)
          const individualElectricityPrice = round(
            (member.electricityUnit.diff * electricityRate) / houseRent?.rents?.length,
            2
          )
          const airConditionPrice = round(
            member.airConditionUnit * houseRent.airCondition.pricePerUnit,
            2
          )
          const baseHouseRent = round(houseRent.baseHouseRent / totalMembers, 2)
          const internetPrice = round(houseRent.internet.pricePerMonth / totalMembers, 2)
          const individualShareElectricityPrice = round(shareElectricityPrice / totalMembers, 2)
          const totalPrice = chain([
            waterPrice,
            individualElectricityPrice,
            airConditionPrice,
            baseHouseRent,
            internetPrice,
            individualShareElectricityPrice,
            houseRent.paymentFee / totalMembers,
          ])
            .sum()
            .round(2)
            .value()

          acc[member.user.username] = {
            username: member.user.username,
            airConditionPrice,
            waterPrice,
            electricityRate,
            individualElectricityPrice,
            electricityUnit: {
              diff: round(member.electricityUnit.diff / houseRent?.rents?.length, 0),
              prev: member.electricityUnit.prev,
              current: member.electricityUnit.current,
            },

            totalPrice,
            baseHouseRent,
          }
          return acc
        }, {})
        acc.push({
          group: houseRent.name,
          title: rent.month,
          electricity: {
            totalPrice: rent.electricity.totalPrice,
            unit: rent.electricity.unit,
            pricePerUnit: electricityRate,
            shareUnit: shareElectricityUnit,
            sharePrice: shareElectricityPrice,
          },
          members,
        })
      })
      return acc
    }, [])
    return { data }
  }

  private async updateAttachments(
    params: CreateHouseRentBodyDto,
    etm: EntityManager,
    houseRentId: string
  ) {
    if (params.attachmentIds?.length) {
      await etm.update(
        AttachmentEntity,
        { id: In(params.attachmentIds) },
        { attachableId: houseRentId, attachableType: 'house_rent' }
      )
      await etm.softDelete(AttachmentEntity, {
        attachableId: houseRentId,
        attachableType: 'house_rent',
        id: Not(In(params.attachmentIds)),
      })
    } else {
      await etm.softDelete(AttachmentEntity, {
        attachableId: houseRentId,
        attachableType: 'house_rent',
      })
    }
  }

  async deleteHouseRent(houseRentId: string) {
    await this.houseRentRepository.softDelete(houseRentId)
  }
}
