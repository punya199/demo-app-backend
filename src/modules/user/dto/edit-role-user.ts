import { IsIn } from 'class-validator'
import { UserRole } from '../../../db/entities/user.entity'

export class EditRoleUserDto {
  @IsIn([UserRole.USER, UserRole.ADMIN])
  role: UserRole
}
