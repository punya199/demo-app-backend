import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { UserEntity } from './user.entity'

// Per user, not per monster: unlocked stages stay unlocked when a new monster hatches.
@Entity({
  name: 'adventure_progress',
})
@Index('IDX_adventure_progress_user_id_stage_id', ['userId', 'stageId'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class AdventureProgressEntity extends BaseModelEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  // Stage id from src/modules/monster/adventure-data.ts
  @Column({ name: 'stage_id', type: 'varchar' })
  stageId: string

  @Column({ name: 'clear_count', type: 'integer' })
  clearCount: number

  @Column({ name: 'first_cleared_at', type: 'timestamp with time zone' })
  firstClearedAt: Date

  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_adventure_progress_user_id' })
  @ManyToOne(() => UserEntity)
  user: UserEntity
}
