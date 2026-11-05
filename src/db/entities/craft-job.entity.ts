import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { UserEntity } from './user.entity'

// One craft in the player's single queue slot (rules in craft-data.ts, flow in craft.service.ts).
// The unique partial index is the queue: one unclaimed job per player. Times are server clock only.
@Entity({
  name: 'craft_jobs',
})
@Index('IDX_craft_jobs_user_id_active', ['userId'], {
  unique: true,
  where: 'claimed_at IS NULL AND deleted_at IS NULL',
})
export class CraftJobEntity extends BaseModelEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  // `${setId}:${slot}`, see craftRecipeId.
  @Column({ name: 'recipe_id', type: 'varchar' })
  recipeId: string

  @Column({ name: 'use_catalyst', type: 'boolean', default: false })
  useCatalyst: boolean

  @Column({ name: 'started_at', type: 'timestamp with time zone' })
  startedAt: Date

  @Column({ name: 'finish_at', type: 'timestamp with time zone' })
  finishAt: Date

  @Column({ name: 'claimed_at', type: 'timestamp with time zone', nullable: true })
  claimedAt: Date | null

  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_craft_jobs_user_id' })
  @ManyToOne(() => UserEntity)
  user: UserEntity
}
