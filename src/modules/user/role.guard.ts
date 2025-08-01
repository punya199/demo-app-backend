import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Request } from 'express'
import { roleLevels, UserRole } from '../../db/entities/user.entity'
import { PayloadUser } from './jwt.strategy'

export const checkRole = (requireRole: UserRole, userRole?: UserRole) => {
  if (!userRole) {
    return false
  }
  const userRoleIndex = roleLevels.indexOf(userRole)
  const requireRoleIndex = roleLevels.indexOf(requireRole)
  return userRoleIndex >= requireRoleIndex
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const expectRoles = this.reflector.getAllAndOverride<UserRole>('role', [
      context.getHandler(),
      context.getClass(),
    ])
    if (!expectRoles) {
      return true
    }

    const request = context.switchToHttp().getRequest<Request>()
    const user = request.user as PayloadUser

    return checkRole(expectRoles, user.role)
  }
}
