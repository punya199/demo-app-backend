// user.entity.ts
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

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

@Entity()
export class Bill {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  title: string

  @Column({ type: 'jsonb', nullable: false })
  items: Item[]

  @Column({ type: 'jsonb', nullable: false })
  friends: Friend[]

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date

  @DeleteDateColumn({ type: 'timestamp with time zone' })
  deletedAt: Date
}
