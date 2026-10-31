import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { UserEntity } from './user.entity'

// Per user: what they have cleared in Boss Raid. Boss and difficulty ids come from
// src/modules/monster/raid-data.ts.
@Entity({
  name: 'raid_progress',
})
@Index('IDX_raid_progress_user_id_boss_id_difficulty', ['userId', 'bossId', 'difficulty'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class RaidProgressEntity extends BaseModelEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  @Column({ name: 'boss_id', type: 'varchar' })
  bossId: string

  @Column({ name: 'difficulty', type: 'varchar' })
  difficulty: string

  @Column({ name: 'clear_count', type: 'integer' })
  clearCount: number

  @Column({ name: 'first_cleared_at', type: 'timestamp with time zone' })
  firstClearedAt: Date

  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_raid_progress_user_id' })
  @ManyToOne(() => UserEntity)
  user: UserEntity
}
