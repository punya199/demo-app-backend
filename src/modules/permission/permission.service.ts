import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { EnumPermissionFeatureName, PermissionsEntity } from '../../db/entities/permissions'
import { permissionActionHelper } from '../../utils/permission-helper'
import { IPermissionOption } from './permission.interface'

@Injectable()
export class PermissionService {
  constructor(
    @InjectRepository(PermissionsEntity)
    private permissionsRepo: Repository<PermissionsEntity>
  ) {}

  getPermissionOptions(): { options: IPermissionOption[] } {
    const permissions = Object.values(EnumPermissionFeatureName)
    return {
      options: permissions.map(permission => ({
        featureName: permission,
        action: permissionActionHelper('0000'),
      })),
    }
  }
}
