import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { UserEntity } from './user.entity'

// A user's arena defense: a frozen copy of their monster's fight stats (gear included, stamina
// full). The name other players see is the player's profile name - never the username (PDPA).
@Entity({
  name: 'pvp_defenses',
})
@Index('IDX_pvp_defenses_user_id', ['userId'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
@Index('IDX_pvp_defenses_stage', ['stage'], {
  where: 'deleted_at IS NULL',
})
export class PvpDefenseEntity extends BaseModelEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  // IFighter from battle-stats.ts
  @Column({ name: 'fighter', type: 'jsonb' })
  fighter: Record<string, unknown>

  @Column({ name: 'stage', type: 'varchar' })
  stage: string

  @Column({ name: 'species_id', type: 'varchar' })
  speciesId: string

  @Column({ name: 'set_at', type: 'timestamp with time zone' })
  setAt: Date

  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_pvp_defenses_user_id' })
  @ManyToOne(() => UserEntity)
  user: UserEntity
}
