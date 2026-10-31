import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { FriendshipEntity } from './friendship.entity'

export enum EnumFriendInteractionKind {
  GREET = 'greet',
  GIFT = 'gift',
}

// A greeting or a gift, kept to enforce the daily limits and as a trail of what was sent.
@Entity({
  name: 'friend_interactions',
})
@Index('IDX_friend_interactions_actor_id_created_at', ['actorId', 'createdAt'], {
  where: 'deleted_at IS NULL',
})
export class FriendInteractionEntity extends BaseModelEntity {
  @Column({ name: 'friendship_id', type: 'uuid' })
  friendshipId: string

  @Column({ name: 'actor_id', type: 'uuid' })
  actorId: string

  @Column({ name: 'kind', type: 'varchar' })
  kind: EnumFriendInteractionKind

  @Column({ name: 'payload', type: 'jsonb', default: {} })
  payload: Record<string, unknown>

  @JoinColumn({
    name: 'friendship_id',
    foreignKeyConstraintName: 'FK_friend_interactions_friendship_id',
  })
  @ManyToOne(() => FriendshipEntity)
  friendship: FriendshipEntity
}
