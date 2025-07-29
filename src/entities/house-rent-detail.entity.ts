import { Type } from 'class-transformer'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { HouseRentEntity } from './house-rent'

export interface IElectricity {
  totalPrice: number
  unit: number
}

export interface IHouseRentDetail {
  id?: string
  month: Date
  houseRentPrice: number // ค่าเช่าบ้าน
  waterPrice: number // ค่าน้ำ
  electricity: IElectricity
}

@Entity({
  name: 'house_rent_details',
})
@Index(['houseRentId'], {
  where: 'deleted_at IS NULL',
})
@Index(['month'], {
  where: 'deleted_at IS NULL',
})
@Index(['houseRentId', 'month'], {
  where: 'deleted_at IS NULL',
  unique: true,
})
export class HouseRentDetailEntity extends BaseModelEntity implements IHouseRentDetail {
  @Column({ name: 'month', type: 'date' })
  month: Date

  @Column({ name: 'house_rent_price', type: 'decimal', precision: 10, scale: 2, default: 0 })
  @Type(() => Number)
  houseRentPrice: number

  @Column({ name: 'water_price', type: 'decimal', precision: 10, scale: 2, default: 0 })
  @Type(() => Number)
  waterPrice: number

  @Column({ name: 'electricity', type: 'jsonb', default: {} })
  electricity: IElectricity

  @Column({ name: 'house_rent_id', type: 'uuid', nullable: false })
  houseRentId: string

  @JoinColumn({ name: 'house_rent_id' })
  @ManyToOne(() => HouseRentEntity, houseRent => houseRent.rents)
  houseRent: HouseRentEntity
}
