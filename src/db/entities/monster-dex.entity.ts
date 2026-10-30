import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { UserEntity } from './user.entity'

// Species a user has ever raised (eggs excluded), written when a monster hatches or evolves.
@Entity({
  name: 'monster_dex',
})
@Index('IDX_monster_dex_user_id_species_id', ['userId', 'speciesId'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class MonsterDexEntity extends BaseModelEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  @Column({ name: 'species_id', type: 'varchar' })
  speciesId: string

  @Column({ name: 'first_seen_at', type: 'timestamp with time zone' })
  firstSeenAt: Date

  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_monster_dex_user_id' })
  @ManyToOne(() => UserEntity)
  user: UserEntity
}
