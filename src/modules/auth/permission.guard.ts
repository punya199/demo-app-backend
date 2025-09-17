import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Request } from 'express'
import { DataSource } from 'typeorm'
import { EnumPermissionFeatureName, PermissionsEntity } from '../../db/entities/permissions'
import {
  IPermissionAction,
  IPermissionsMap,
  permissionActionHelper,
} from '../../utils/permission-helper'
import { IAppJwtPayload } from './auth.interface'

export interface IPermissionGuardData {
  featureName: EnumPermissionFeatureName
  action: Partial<IPermissionAction>
}

export const checkPermission = (
  permissionRequired: IPermissionGuardData,
  userPermissions?: IPermissionsMap
) => {
  const userFeaturePermission = userPermissions?.[permissionRequired.featureName]
  if (!userFeaturePermission) {
    return false
  }
  const userActionPermission = permissionActionHelper(userFeaturePermission)

  for (const [actionKey, actionValue] of Object.entries(permissionRequired.action)) {
    if (!actionValue) continue

    if (!userActionPermission[actionKey]) {
      return false
    }
  }
  return true
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly dataSource: DataSource
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permissionRequired = this.reflector.getAllAndOverride<IPermissionGuardData>(
      'permissionRequired',
      [context.getHandler(), context.getClass()]
    )
    if (!permissionRequired) {
      return false
    }

    const request = context.switchToHttp().getRequest<Request>()
    const user = request.user as IAppJwtPayload
    const userPermissions = await this.dataSource.getRepository(PermissionsEntity).find({
      where: { userId: user['user-id'] },
      cache: 10 * 1000,
    })
    const userPermissionsMap = userPermissions.reduce((acc: IPermissionsMap, permission) => {
      acc[permission.featureName] = permission.action
      return acc
    }, {})
    return checkPermission(permissionRequired, userPermissionsMap)
  }
}
