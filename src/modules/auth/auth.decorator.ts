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
import { RolesGuard } from './role.guard'
import { UsernameGuard } from './username.guard'

export const ReqUser = createParamDecorator((data, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Request>()
  return request.user as IAppJwtPayload
})

export const AuthUser = (role?: UserRole) =>
  applyDecorators(SetMetadata('role', role), UseGuards(JwtAccessTokenAuthGuard, RolesGuard))

// Restricts a route to specific username(s). Role is optional - pass it when the data should
// also be gated by role, omit it when the username allowlist alone is the access control
// (e.g. a private ledger shared with a couple of specific accounts regardless of their role).
export const AuthUserWithUsername = (username: string | string[], role?: UserRole) =>
  applyDecorators(
    ...(role ? [SetMetadata('role', role)] : []),
    SetMetadata('username', username),
    UseGuards(JwtAccessTokenAuthGuard, RolesGuard, UsernameGuard)
  )

export const AuthUserPermission = (permissionRequired: IPermissionGuardData) =>
  applyDecorators(
    SetMetadata('permissionRequired', permissionRequired),
    UseGuards(JwtAccessTokenAuthGuard, PermissionGuard)
  )

export const RefreshTokenAuthGuard = () => applyDecorators(UseGuards(JwtRefreshTokenAuthGuard))
