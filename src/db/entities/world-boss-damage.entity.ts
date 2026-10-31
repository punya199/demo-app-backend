import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { UserEntity } from './user.entity'
import { WorldBossEntity } from './world-boss.entity'

// What one player did to one week's boss. The rank comes from `damage`, and the week's rewards are
// claimed once, after the week ends or the boss falls.
@Entity({
  name: 'world_boss_damage',
})
@Index('IDX_world_boss_damage_world_boss_id_user_id', ['worldBossId', 'userId'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
@Index('IDX_world_boss_damage_world_boss_id_damage', ['worldBossId', 'damage'], {
  where: 'deleted_at IS NULL',
})
export class WorldBossDamageEntity extends BaseModelEntity {
  @Column({ name: 'world_boss_id', type: 'uuid' })
  worldBossId: string

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  @Column({ name: 'damage', type: 'integer', default: 0 })
  damage: number

  @Column({ name: 'hits', type: 'integer', default: 0 })
  hits: number

  @Column({ name: 'reward_claimed_at', type: 'timestamp with time zone', nullable: true })
  rewardClaimedAt: Date | null

  @JoinColumn({
    name: 'world_boss_id',
    foreignKeyConstraintName: 'FK_world_boss_damage_world_boss_id',
  })
  @ManyToOne(() => WorldBossEntity)
  worldBoss: WorldBossEntity

  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_world_boss_damage_user_id' })
  @ManyToOne(() => UserEntity)
  user: UserEntity
}
