import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { UserEntity } from './user.entity'

// A costume a player owns for good (ids from src/modules/monster/costume-data.ts). Free costumes
// are owned by everyone and have no row. What each pet wears is `monsters.costume`.
@Entity({
  name: 'player_costumes',
})
@Index('IDX_player_costumes_user_id_costume_id', ['userId', 'costumeId'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class PlayerCostumeEntity extends BaseModelEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  @Column({ name: 'costume_id', type: 'varchar' })
  costumeId: string

  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_player_costumes_user_id' })
  @ManyToOne(() => UserEntity)
  user: UserEntity
}
