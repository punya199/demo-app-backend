import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { UserEntity } from './user.entity'

// Catalyst failures in a row, per player and grade step (`epic_legendary`, `legendary_mythic`).
@Entity({
  name: 'craft_pity',
})
@Index('IDX_craft_pity_user_id_step', ['userId', 'step'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class CraftPityEntity extends BaseModelEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  @Column({ name: 'step', type: 'varchar' })
  step: string

  @Column({ name: 'fails', type: 'integer', default: 0 })
  fails: number

  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_craft_pity_user_id' })
  @ManyToOne(() => UserEntity)
  user: UserEntity
}
