import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { UserEntity } from './user.entity'

export enum EnumFeatureName {
  HOUSE_RENT = 'house_rent',
  BILL = 'bill',
  USER = 'user',
}

@Entity({
  name: 'permissions',
})
@Index(['userId', 'featureName'], {
  where: 'deleted_at IS NULL',
  unique: true,
})
@Index(['featureName'], {
  where: 'deleted_at IS NULL',
})
@Index(['userId'], {
  where: 'deleted_at IS NULL',
})
export class PermissionsEntity extends BaseModelEntity {
  @Column({ name: 'user_id', type: 'uuid', nullable: false })
  userId: string

  @Column({ name: 'feature_name', type: 'enum', enum: EnumFeatureName, nullable: false })
  featureName: EnumFeatureName

  @Column({
    name: 'action',
    type: 'varchar',
    length: 4,
    default: '0000',
  })
  action: string

  @JoinColumn({ name: 'user_id' })
  @ManyToOne(() => UserEntity, user => user.permissions)
  user: UserEntity
}
