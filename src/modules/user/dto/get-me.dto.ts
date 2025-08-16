import { Expose, Type } from 'class-transformer'
import { EnumFeatureName } from '../../../db/entities/permissions'
import { UserRole } from '../../../db/entities/user.entity'

export class PermissionActionResponseDto {
  @Expose()
  canRead: boolean

  @Expose()
  canCreate: boolean

  @Expose()
  canUpdate: boolean

  @Expose()
  canDelete: boolean
}

export class PermissionResponseDto {
  @Expose()
  id: string

  @Expose()
  featureName: EnumFeatureName

  @Expose()
  @Type(() => PermissionActionResponseDto)
  action: PermissionActionResponseDto
}

export class GetMeResponseDto {
  @Expose()
  id: string

  @Expose()
  username: string

  @Expose()
  role: UserRole

  @Expose()
  @Type(() => PermissionResponseDto)
  permissions: PermissionResponseDto[]
}
