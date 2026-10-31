import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { UserEntity } from './user.entity'

// Every arena fight. The seed plus both fighters' stats replay it exactly (simulateBattle), so no
// event log is stored. `defender_id` is null against an NPC; `opponent_id` is the defense row id
// or the NPC id the challenger picked.
@Entity({
  name: 'pvp_battles',
})
@Index('IDX_pvp_battles_attacker_id_created_at', ['attackerId', 'createdAt'], {
  where: 'deleted_at IS NULL',
})
@Index('IDX_pvp_battles_defender_id_created_at', ['defenderId', 'createdAt'], {
  where: 'deleted_at IS NULL',
})
export class PvpBattleEntity extends BaseModelEntity {
  @Column({ name: 'season', type: 'varchar' })
  season: string

  @Column({ name: 'attacker_id', type: 'uuid' })
  attackerId: string

  @Column({ name: 'defender_id', type: 'uuid', nullable: true })
  defenderId: string | null

  @Column({ name: 'opponent_id', type: 'varchar' })
  opponentId: string

  @Column({ name: 'attacker_name', type: 'varchar' })
  attackerName: string

  @Column({ name: 'defender_name', type: 'varchar' })
  defenderName: string

  @Column({ name: 'seed', type: 'integer' })
  seed: number

  @Column({ name: 'attacker', type: 'jsonb' })
  attacker: Record<string, unknown>

  @Column({ name: 'defender', type: 'jsonb' })
  defender: Record<string, unknown>

  // From the attacker's point of view.
  @Column({ name: 'won', type: 'boolean' })
  won: boolean

  @Column({ name: 'attacker_rating_before', type: 'integer' })
  attackerRatingBefore: number

  @Column({ name: 'attacker_rating_after', type: 'integer' })
  attackerRatingAfter: number

  @Column({ name: 'defender_rating_before', type: 'integer' })
  defenderRatingBefore: number

  // Null against an NPC, whose rating never moves.
  @Column({ name: 'defender_rating_after', type: 'integer', nullable: true })
  defenderRatingAfter: number | null

  @Column({ name: 'reward', type: 'integer', default: 0 })
  reward: number

  @JoinColumn({ name: 'attacker_id', foreignKeyConstraintName: 'FK_pvp_battles_attacker_id' })
  @ManyToOne(() => UserEntity)
  attackerUser: UserEntity
}
