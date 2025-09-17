import { EnumPermissionFeatureName, PermissionsEntity } from '../db/entities/permissions'

export type IPermissionsMap = Partial<
  Record<EnumPermissionFeatureName, PermissionsEntity['action']>
>
export interface IPermissionAction {
  canRead: boolean
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}

export const permissionActionHelper = (action: string): IPermissionAction => {
  const [canRead, canCreate, canUpdate, canDelete] = action?.split('') || ['0', '0', '0', '0']

  return {
    canRead: canRead === '1',
    canCreate: canCreate === '1',
    canUpdate: canUpdate === '1',
    canDelete: canDelete === '1',
  }
}
