import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Request } from 'express'
import { AppBadRequestException } from '../../utils/exception'

export const TWO_FACTOR_PENDING_SCOPE = 'two-factor-pending'

export interface ITwoFactorPendingPayload {
  sub: string
  scope: typeof TWO_FACTOR_PENDING_SCOPE
}

// Guards `POST /auth/2fa/verify`. Deliberately separate from JwtAccessTokenAuthGuard:
// a pending token only proves "password was correct", not "fully authenticated",
// so it must never be usable against any other @AuthUser() route.
@Injectable()
export class TwoFactorPendingGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>()
    const token = req.headers.authorization?.replace(/^Bearer /, '')

    if (!token) {
      throw new AppBadRequestException({ code: 'AUT4002' })
    }

    let payload: ITwoFactorPendingPayload
    try {
      payload = this.jwtService.verify<ITwoFactorPendingPayload>(token)
    } catch {
      throw new AppBadRequestException({ code: 'AUT4003' })
    }

    if (payload.scope !== TWO_FACTOR_PENDING_SCOPE) {
      throw new AppBadRequestException({ code: 'AUT4011' })
    }

    req.user = payload
    return true
  }
}
