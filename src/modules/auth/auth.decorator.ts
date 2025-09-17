import {
  applyDecorators,
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
  UseGuards,
} from '@nestjs/common'
import { Request } from 'express'
import { UserRole } from '../../db/entities/user.entity'
import { JwtAccessTokenAuthGuard } from '../authentication/guard/jwt-access-token-auth.guard'
import { JwtRefreshTokenAuthGuard } from '../authentication/guard/jwt-refresh-token-auth.guard'
import { IAppJwtPayload } from './auth.interface'
import { IPermissionGuardData, PermissionGuard } from './permission.guard'

export const ReqUser = createParamDecorator((data, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Request>()
  return request.user as IAppJwtPayload
})

export const AuthUser = (role?: UserRole) =>
  applyDecorators(SetMetadata('role', role), UseGuards(JwtAccessTokenAuthGuard))

export const AuthUserPermission = (permissionRequired: IPermissionGuardData) =>
  applyDecorators(
    SetMetadata('permissionRequired', permissionRequired),
    UseGuards(JwtAccessTokenAuthGuard, PermissionGuard)
  )

export const RefreshTokenAuthGuard = () => applyDecorators(UseGuards(JwtRefreshTokenAuthGuard))
