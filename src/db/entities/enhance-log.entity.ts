import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { UserEntity } from './user.entity'

// One row per enhance attempt: the rate actually rolled against, the outcome and what it cost.
@Entity({
  name: 'enhance_logs',
})
@Index('IDX_enhance_logs_user_id', ['userId'], {
  where: 'deleted_at IS NULL',
})
export class EnhanceLogEntity extends BaseModelEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  @Column({ name: 'equipment_id', type: 'uuid' })
  equipmentId: string

  @Column({ name: 'from_level', type: 'integer' })
  fromLevel: number

  @Column({ name: 'to_level', type: 'integer' })
  toLevel: number

  @Column({ name: 'rate', type: 'real' })
  rate: number

  @Column({ name: 'success', type: 'boolean' })
  success: boolean

  @Column({ name: 'broke', type: 'boolean' })
  broke: boolean

  @Column({ name: 'cost', type: 'jsonb', default: {} })
  cost: Record<string, unknown>

  @Column({ name: 'pity_before', type: 'integer' })
  pityBefore: number

  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_enhance_logs_user_id' })
  @ManyToOne(() => UserEntity)
  user: UserEntity
}
