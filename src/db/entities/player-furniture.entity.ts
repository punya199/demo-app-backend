import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { UserEntity } from './user.entity'

// One piece of Farm furniture a player owns and its tier (rules in monster/farm/farm-data.ts).
// A kind that was never bought has no row; tier 0 is never stored.
@Entity({
  name: 'player_furniture',
})
@Index('IDX_player_furniture_user_id_kind', ['userId', 'kind'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class PlayerFurnitureEntity extends BaseModelEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  // EnumFurnitureKind.
  @Column({ name: 'kind', type: 'varchar' })
  kind: string

  @Column({ name: 'tier', type: 'int', default: 1 })
  tier: number

  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_player_furniture_user_id' })
  @ManyToOne(() => UserEntity)
  user: UserEntity
}
