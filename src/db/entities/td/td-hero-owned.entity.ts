import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm'

// One row per hero a player owns. `heroId` is a key into TD_HEROES (modules/td/gacha.config.ts).
@Entity({ schema: 'td', name: 'hero_owned' })
@Unique('UQ_td_hero_owned_user_hero', ['userId', 'heroId'])
export class TdHeroOwnedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  @Column({ name: 'hero_id', type: 'varchar' })
  heroId: string

  @Column({ name: 'star_level', type: 'integer', default: 1 })
  starLevel: number

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date
}
