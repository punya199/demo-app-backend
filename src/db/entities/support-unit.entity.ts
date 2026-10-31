import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { UserEntity } from './user.entity'

// The monster a player offers friends to rent: a frozen copy of its fight stats (gear included,
// stamina full), like an arena defense but kept separate. Never usable in PvP.
@Entity({
  name: 'support_units',
})
@Index('IDX_support_units_user_id', ['userId'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class SupportUnitEntity extends BaseModelEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  // IFighter from battle-stats.ts
  @Column({ name: 'fighter', type: 'jsonb' })
  fighter: Record<string, unknown>

  @Column({ name: 'stage', type: 'varchar' })
  stage: string

  @Column({ name: 'set_at', type: 'timestamp with time zone' })
  setAt: Date

  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_support_units_user_id' })
  @ManyToOne(() => UserEntity)
  user: UserEntity
}
