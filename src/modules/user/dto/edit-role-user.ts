import { IsIn } from 'class-validator'
import { EnumUserStatus, UserRole } from '../../../db/entities/user.entity'

export class EditRoleUserDto {
  @IsIn([UserRole.USER, UserRole.ADMIN])
  role: UserRole

  @IsIn([EnumUserStatus.ACTIVE, EnumUserStatus.INACTIVE, EnumUserStatus.BLOCKED])
  status: EnumUserStatus
}
