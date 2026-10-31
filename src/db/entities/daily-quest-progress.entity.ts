import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { UserEntity } from './user.entity'

// One row per user, quest and day (quest_date is the Thai calendar day). A new day simply has no
// rows yet, so there is no reset job.
@Entity({
  name: 'daily_quest_progress',
})
@Index('IDX_daily_quest_progress_user_id_quest_date_quest_id', ['userId', 'questDate', 'questId'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class DailyQuestProgressEntity extends BaseModelEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  // YYYY-MM-DD in Thai time, see getQuestDate() in quest-data.ts
  @Column({ name: 'quest_date', type: 'varchar' })
  questDate: string

  // Quest id from src/modules/monster/quest-data.ts
  @Column({ name: 'quest_id', type: 'varchar' })
  questId: string

  @Column({ name: 'progress', type: 'integer' })
  progress: number

  @Column({ name: 'claimed_at', type: 'timestamp with time zone', nullable: true })
  claimedAt: Date | null

  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_daily_quest_progress_user_id',
  })
  @ManyToOne(() => UserEntity)
  user: UserEntity
}
