// user.entity.ts
import { Exclude } from 'class-transformer'
import { Column, Entity, Index, OneToMany } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { HouseRentMemberEntity } from './house-rent-member.entity'

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

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

  @Column({ name: 'role', type: 'varchar', default: UserRole.USER, nullable: false })
  role: UserRole

  @OneToMany(() => HouseRentMemberEntity, houseRentMember => houseRentMember.user)
  houseRentMembers: HouseRentMemberEntity[]
}
