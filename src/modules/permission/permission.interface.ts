import { EnumPermissionFeatureName } from '../../db/entities/permissions'
import { IPermissionAction } from '../../utils/permission-helper'

export interface IPermissionOption {
  featureName: EnumPermissionFeatureName
  action: IPermissionAction
}
