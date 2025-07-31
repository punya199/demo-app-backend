import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Request } from 'express'
import { PayloadUser } from './jwt.strategy'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const expectRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ])
    if (expectRoles.length === 0) {
      return true
    }

    const request = context.switchToHttp().getRequest<Request>()
    const user = request.user as PayloadUser

    return expectRoles.includes(user.role)
  }
}
