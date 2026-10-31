import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { UserEntity } from './user.entity'

export enum EnumFriendshipStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
}

// One row per pair of players, smaller id first (see orderPair in social-data.ts), so two people
// asking each other at the same moment hit the same unique row. `points` are shared by the pair.
@Entity({
  name: 'friendships',
})
@Index('IDX_friendships_user_low_user_high', ['userLow', 'userHigh'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
@Index('IDX_friendships_user_high', ['userHigh'], {
  where: 'deleted_at IS NULL',
})
export class FriendshipEntity extends BaseModelEntity {
  @Column({ name: 'user_low', type: 'uuid' })
  userLow: string

  @Column({ name: 'user_high', type: 'uuid' })
  userHigh: string

  @Column({ name: 'requested_by', type: 'uuid' })
  requestedBy: string

  @Column({ name: 'status', type: 'varchar' })
  status: EnumFriendshipStatus

  @Column({ name: 'points', type: 'integer', default: 0 })
  points: number

  @JoinColumn({ name: 'user_low', foreignKeyConstraintName: 'FK_friendships_user_low' })
  @ManyToOne(() => UserEntity)
  low: UserEntity

  @JoinColumn({ name: 'user_high', foreignKeyConstraintName: 'FK_friendships_user_high' })
  @ManyToOne(() => UserEntity)
  high: UserEntity
}
