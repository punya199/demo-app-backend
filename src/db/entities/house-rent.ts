import { Type } from 'class-transformer'
import { Column, Entity, Index, OneToMany } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { HouseRentDetailEntity, IHouseRentDetail } from './house-rent-detail.entity'
import { HouseRentMemberEntity, IHouseRentMember } from './house-rent-member.entity'

export interface IElectricitySummaryData {
  totalUnit: number
  totalPrice: number
  pricePerUnit: number
  shareUnit: number
}

export interface IInternet {
  pricePerMonth: number
}

export interface IAirCondition {
  pricePerUnit: number
}

export interface IHouseRent {
  name: string
  rents: IHouseRentDetail[]
  members: IHouseRentMember[]
  baseHouseRent: number
  paymentFee: number
  internet: IInternet
  airCondition: IAirCondition
}

@Entity({
  name: 'house_rents',
})
@Index(['name'], {
  where: 'deleted_at IS NULL',
  unique: true,
})
export class HouseRentEntity extends BaseModelEntity implements IHouseRent {
  @Column({ name: 'name', type: 'varchar' })
  name: string

  @Column({ name: 'base_house_rent', type: 'decimal', precision: 10, scale: 2, default: 0 })
  @Type(() => Number)
  baseHouseRent: number

  @Column({ name: 'payment_fee', type: 'decimal', precision: 10, scale: 2, default: 0 })
  @Type(() => Number)
  paymentFee: number

  @Column({ name: 'internet', type: 'jsonb', default: {} })
  internet: IInternet

  @Column({ name: 'air_condition', type: 'jsonb', default: {} })
  airCondition: IAirCondition

  @OneToMany(() => HouseRentDetailEntity, rent => rent.houseRent)
  rents: HouseRentDetailEntity[]

  @OneToMany(() => HouseRentMemberEntity, member => member.houseRent)
  members: HouseRentMemberEntity[]
}
