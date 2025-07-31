// user.entity.ts
import { Column, Entity, Index } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'

export interface Item {
  name: string
  price: number
  id: string
  payerId?: string
  friendIds?: string[]
}

export interface Friend {
  name: string
  id: string
}

@Entity({
  name: 'bills',
})
@Index(['title'], {
  where: 'deleted_at IS NULL',
})
export class BillEntity extends BaseModelEntity {
  @Column({
    name: 'title',
    type: 'varchar',
    nullable: false,
  })
  title: string

  @Column({ name: 'items', type: 'jsonb', nullable: false, default: [] })
  items: Item[]

  @Column({ name: 'friends', type: 'jsonb', nullable: false, default: [] })
  friends: Friend[]
}
