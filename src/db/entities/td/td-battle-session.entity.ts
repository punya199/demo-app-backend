import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm'

import { PoolEntry } from '../../../libs/td-sim'

// One row per started battle. The id is the single-use battle id: `finish` flips status to
// 'finished' under a row lock, so a second finish is refused. Rows are kept as the audit trail.
@Entity({ schema: 'td', name: 'battle_session' })
export class TdBattleSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  // uint32; bigint comes back from the driver as a string.
  @Column({ name: 'seed', type: 'bigint' })
  seed: string

  // 'started' | 'finished'
  @Column({ name: 'status', type: 'varchar', default: 'started' })
  status: string

  @Column({ name: 'expires_at', type: 'timestamp with time zone' })
  expiresAt: Date

  // Owned-hero snapshot taken at battle start; the replay uses exactly this. Null on older rows.
  @Column({ name: 'hero_pool', type: 'jsonb', nullable: true })
  heroPool: PoolEntry[] | null

  // The stage this battle was started on (1 to STAGE_COUNT); the replay plays that stage.
  @Column({ name: 'stage_id', type: 'integer', default: 1 })
  stageId: number

  // 'won' | 'lost', from the replay
  @Column({ name: 'result', type: 'varchar', nullable: true })
  result: string | null

  @Column({ name: 'coins_awarded', type: 'integer', nullable: true })
  coinsAwarded: number | null

  @Column({ name: 'replay_hash', type: 'varchar', nullable: true })
  replayHash: string | null

  @Column({ name: 'finished_at', type: 'timestamp with time zone', nullable: true })
  finishedAt: Date | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date
}
