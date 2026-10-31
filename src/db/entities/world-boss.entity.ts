import { Column, Entity, Index } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'

// One row per Thai ISO week (YYYY-Www), created by the week's first request. All players share
// `hp`; it never goes below 0. Boss data and rewards live in src/modules/monster/world-boss-data.ts.
@Entity({
  name: 'world_bosses',
})
@Index('IDX_world_bosses_week', ['week'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class WorldBossEntity extends BaseModelEntity {
  @Column({ name: 'week', type: 'varchar' })
  week: string

  @Column({ name: 'boss_id', type: 'varchar' })
  bossId: string

  @Column({ name: 'max_hp', type: 'integer' })
  maxHp: number

  @Column({ name: 'hp', type: 'integer' })
  hp: number

  @Column({ name: 'starts_at', type: 'timestamp with time zone' })
  startsAt: Date

  @Column({ name: 'ends_at', type: 'timestamp with time zone' })
  endsAt: Date

  @Column({ name: 'defeated_at', type: 'timestamp with time zone', nullable: true })
  defeatedAt: Date | null

  // Whoever landed the hit that emptied the boss; never sent to other players.
  @Column({ name: 'killed_by_user_id', type: 'uuid', nullable: true })
  killedByUserId: string | null
}
