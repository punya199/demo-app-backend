import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm'

// A hero's gear mod level for one player. No row means level 0. `heroId` is a key into TD_HEROES.
@Entity({ schema: 'td', name: 'gear_mod' })
@Unique('UQ_td_gear_mod_user_hero', ['userId', 'heroId'])
export class TdGearModEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  @Column({ name: 'hero_id', type: 'varchar' })
  heroId: string

  @Column({ name: 'level', type: 'integer', default: 0 })
  level: number

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date
}
