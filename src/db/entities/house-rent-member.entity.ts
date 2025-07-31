import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { HouseRentEntity } from './house-rent'
import { UserEntity } from './user.entity'

export interface IElectricityUnit {
  prev: number
  current: number
  diff: number
}

export interface IHouseRentMember {
  id?: string
  userId: string
  airConditionUnit: number
  electricityUnit: IElectricityUnit
  payInternetMonthIds?: string[]
  payElectricityMonthIds?: string[]
}

@Entity({
  name: 'house_rent_members',
})
@Index(['houseRentId'], {
  where: 'deleted_at IS NULL',
})
@Index(['userId', 'houseRentId'], {
  where: 'deleted_at IS NULL',
  unique: true,
})
export class HouseRentMemberEntity extends BaseModelEntity implements IHouseRentMember {
  @Column({ name: 'user_id', type: 'uuid', nullable: false })
  userId: string

  @Column({ name: 'air_condition_unit', type: 'integer', default: 0 })
  airConditionUnit: number

  @Column({ name: 'electricity_unit', type: 'jsonb', default: {} })
  electricityUnit: IElectricityUnit

  @Column({ name: 'pay_internet_month_ids', type: 'jsonb', default: [] })
  payInternetMonthIds?: string[]

  @Column({ name: 'pay_electricity_month_ids', type: 'jsonb', default: [] })
  payElectricityMonthIds?: string[]

  @Column({ name: 'house_rent_id', type: 'uuid', nullable: false })
  houseRentId: string

  @JoinColumn({ name: 'user_id' })
  @ManyToOne(() => UserEntity, user => user.houseRentMembers)
  user: UserEntity

  @JoinColumn({ name: 'house_rent_id' })
  @ManyToOne(() => HouseRentEntity, houseRent => houseRent.members)
  houseRent: HouseRentEntity
}
