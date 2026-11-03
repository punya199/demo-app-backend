import { Column, Entity, Index } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'

// One row per player: the trainer passive nodes they own (ids from
// src/modules/monster/passive-data.ts) and how many points they have already taken back.
@Entity({
  name: 'passive_allocations',
})
@Index('IDX_passive_allocations_user_id', ['userId'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class PassiveAllocationEntity extends BaseModelEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  @Column({ name: 'node_ids', type: 'jsonb', default: () => `'[]'` })
  nodeIds: string[]

  // Points taken back so far; the first PASSIVE_FREE_REFUNDS are free, the rest cost gems.
  @Column({ name: 'refunded_points', type: 'integer', default: 0 })
  refundedPoints: number

  // Mastery node id -> index of the option the player picked (0..2).
  @Column({ name: 'mastery_picks', type: 'jsonb', default: () => `'{}'` })
  masteryPicks: Record<string, number>

  // Ascendancy: one path per player, with its own point pool (see ascendancy in passive-data.ts).
  @Column({ name: 'ascendancy_path', type: 'varchar', nullable: true })
  ascendancyPath: string | null

  @Column({ name: 'ascendancy_node_ids', type: 'jsonb', default: () => `'[]'` })
  ascendancyNodeIds: string[]
}
