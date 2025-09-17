import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsEnum, IsNotEmpty, ValidateNested } from 'class-validator'
import { EnumPermissionFeatureName } from '../../../db/entities/permissions'
import { IPermissionAction } from '../../../utils/permission-helper'

class EditPermissionActionData implements IPermissionAction {
  @IsNotEmpty()
  @IsBoolean()
  canRead: boolean

  @IsNotEmpty()
  @IsBoolean()
  canCreate: boolean

  @IsNotEmpty()
  @IsBoolean()
  canUpdate: boolean

  @IsNotEmpty()
  @IsBoolean()
  canDelete: boolean
}

class EditPermissionData {
  @IsNotEmpty()
  @IsEnum(EnumPermissionFeatureName)
  featureName: EnumPermissionFeatureName

  @IsNotEmpty()
  @ValidateNested()
  @Type(() => EditPermissionActionData)
  action: EditPermissionActionData
}

export class EditUserPermissionsDto {
  @IsNotEmpty()
  @IsArray()
  @Type(() => EditPermissionData)
  @ValidateNested({ each: true })
  permissions: EditPermissionData[]
}
