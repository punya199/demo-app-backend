import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Request } from 'express'
import { IAppJwtPayload } from './auth.interface'

@Injectable()
export class UsernameGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const expectUsername = this.reflector.getAllAndOverride<string | string[]>('username', [
      context.getHandler(),
      context.getClass(),
    ])
    if (!expectUsername) {
      return true
    }

    const request = context.switchToHttp().getRequest<Request>()
    const user = request.user as IAppJwtPayload
    const allowedUsernames = Array.isArray(expectUsername) ? expectUsername : [expectUsername]

    return allowedUsernames.includes(user.username)
  }
}
