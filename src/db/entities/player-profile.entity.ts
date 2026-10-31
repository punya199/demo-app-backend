import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { UserEntity } from './user.entity'

// What other players know about someone: a name they chose (or a default tag) and a friend code they
// hand out themselves. The username and email never appear anywhere other players can see (PDPA).
@Entity({
  name: 'player_profiles',
})
@Index('IDX_player_profiles_user_id', ['userId'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
@Index('IDX_player_profiles_friend_code', ['friendCode'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class PlayerProfileEntity extends BaseModelEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  @Column({ name: 'display_name', type: 'varchar' })
  displayName: string

  @Column({ name: 'friend_code', type: 'varchar' })
  friendCode: string

  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_player_profiles_user_id' })
  @ManyToOne(() => UserEntity)
  user: UserEntity
}
