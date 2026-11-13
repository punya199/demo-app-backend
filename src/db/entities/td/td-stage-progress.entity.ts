import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm'

// Best result per stage for one player. A row exists once the stage has been cleared, so its
// creation is the first clear (the unique key makes that exactly-once under concurrency).
@Entity({ schema: 'td', name: 'stage_progress' })
@Unique('UQ_td_stage_progress_user_stage', ['userId', 'stageId'])
export class TdStageProgressEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  @Column({ name: 'stage_id', type: 'integer' })
  stageId: number

  // Best stars so far, 1 to 3.
  @Column({ name: 'stars', type: 'integer' })
  stars: number

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date
}
