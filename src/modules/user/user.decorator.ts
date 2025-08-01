import {
  applyDecorators,
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
  UseGuards,
} from '@nestjs/common'
import { Request } from 'express'
import { UserRole } from '../../db/entities/user.entity'
import { JwtAuthGuard } from './jwt-auth.guard'
import { PayloadUser } from './jwt.strategy'

export const ReqUser = createParamDecorator((data, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Request>()
  return request.user as PayloadUser
})
export const Roles = (role?: UserRole) => SetMetadata('role', role)

export const AuthUser = (role?: UserRole) => applyDecorators(Roles(role), UseGuards(JwtAuthGuard))
