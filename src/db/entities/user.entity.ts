// user.entity.ts
import { Exclude } from 'class-transformer'
import { Column, Entity, Index, OneToMany } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { HouseRentMemberEntity } from './house-rent-member.entity'
import { PermissionsEntity } from './permissions'

export enum EnumUserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  BLOCKED = 'blocked',
}

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin',
}
export const roleLevels: UserRole[] = [UserRole.USER, UserRole.ADMIN, UserRole.SUPER_ADMIN]

@Entity({
  name: 'users',
})
@Index(['username'], {
  where: 'deleted_at IS NULL',
  unique: true,
})
@Index(['role'], {
  where: 'deleted_at IS NULL',
})
@Index(['password'], {
  where: 'deleted_at IS NULL',
})
export class UserEntity extends BaseModelEntity {
  @Column({ name: 'username', type: 'varchar', nullable: false })
  username: string

  @Exclude()
  @Column({ name: 'password', type: 'varchar', select: false, nullable: false })
  password: string

  @Column({ name: 'role', type: 'enum', enum: UserRole, default: UserRole.USER, nullable: false })
  role: UserRole

  @Column({
    name: 'status',
    type: 'enum',
    enum: EnumUserStatus,
    default: EnumUserStatus.ACTIVE,
    nullable: false,
  })
  status: EnumUserStatus

  @Column({ name: 'two_factor_enabled', type: 'boolean', default: false, nullable: false })
  twoFactorEnabled: boolean

  @Exclude()
  @Column({ name: 'two_factor_secret', type: 'varchar', select: false, nullable: true })
  twoFactorSecret: string | null

  @Exclude()
  @Column({ name: 'backup_codes', type: 'jsonb', select: false, nullable: true })
  backupCodes: { hash: string; usedAt: string | null }[] | null

  @OneToMany(() => HouseRentMemberEntity, houseRentMember => houseRentMember.user)
  houseRentMembers: HouseRentMemberEntity[]

  @OneToMany(() => PermissionsEntity, permissions => permissions.user)
  permissions: PermissionsEntity[]
}
