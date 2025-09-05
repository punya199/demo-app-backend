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

export const ReqUser = createParamDecorator((data, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Request>()
  return request.user as IAppJwtPayload
})
export const Roles = (role?: UserRole) => SetMetadata('role', role)

export const AuthUser = (role?: UserRole) =>
  applyDecorators(Roles(role), UseGuards(JwtAccessTokenAuthGuard))

export const RefreshTokenAuthGuard = () => applyDecorators(UseGuards(JwtRefreshTokenAuthGuard))
