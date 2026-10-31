import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { UserEntity } from './user.entity'

// One row per user per season (YYYY-MM, Thai time). Rows of finished seasons stop changing, so
// final ranks and rewards need no job. Rules live in elo.ts and pvp-season.ts.
@Entity({
  name: 'pvp_ratings',
})
@Index('IDX_pvp_ratings_user_id_season', ['userId', 'season'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
@Index('IDX_pvp_ratings_season_rating', ['season', 'rating'], {
  where: 'deleted_at IS NULL',
})
export class PvpRatingEntity extends BaseModelEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  @Column({ name: 'season', type: 'varchar' })
  season: string

  @Column({ name: 'rating', type: 'integer' })
  rating: number

  @Column({ name: 'wins', type: 'integer', default: 0 })
  wins: number

  @Column({ name: 'losses', type: 'integer', default: 0 })
  losses: number

  @Column({ name: 'reward_claimed_at', type: 'timestamp with time zone', nullable: true })
  rewardClaimedAt: Date | null

  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_pvp_ratings_user_id' })
  @ManyToOne(() => UserEntity)
  user: UserEntity
}
