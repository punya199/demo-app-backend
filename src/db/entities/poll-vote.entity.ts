import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { PollEntity } from './poll.entity'
import { UserEntity } from './user.entity'

export interface IPollVoteSelection {
  optionId: string
  // Only set for ranking polls: 0 = most preferred. Null for single/multiple selections.
  rank: number | null
}

@Entity({
  name: 'poll_votes',
})
@Index(['pollId'], {
  where: 'deleted_at IS NULL',
})
@Index(['pollId', 'voterUserId'], {
  unique: true,
  where: 'voter_user_id IS NOT NULL AND deleted_at IS NULL',
})
@Index(['pollId', 'voterToken'], {
  unique: true,
  where: 'voter_token IS NOT NULL AND deleted_at IS NULL',
})
export class PollVoteEntity extends BaseModelEntity {
  @Column({ name: 'poll_id', type: 'uuid' })
  pollId: string

  @Column({ name: 'voter_user_id', type: 'uuid', nullable: true })
  voterUserId: string | null

  @Column({ name: 'voter_token', type: 'varchar', nullable: true })
  voterToken: string | null

  @Column({ name: 'selections', type: 'jsonb' })
  selections: IPollVoteSelection[]

  @JoinColumn({ name: 'poll_id' })
  @ManyToOne(() => PollEntity)
  poll: PollEntity

  @JoinColumn({ name: 'voter_user_id' })
  @ManyToOne(() => UserEntity, { nullable: true })
  voterUser: UserEntity | null
}
