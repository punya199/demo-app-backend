import { ExecutionContext, Injectable } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { Response } from 'express'
import { JsonWebTokenError } from 'jsonwebtoken'
import { lastValueFrom, Observable } from 'rxjs'
import { AppBadRequestException } from '../../../utils/exception'
import { EnumCookieKeys, EnumJwtStrategy } from '../authentication.constant'

@Injectable()
export class JwtAccessTokenAuthGuard extends AuthGuard(EnumJwtStrategy.ACCESS_TOKEN) {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const res = context.switchToHttp().getResponse<Response>()
    const isAccessValid = await super.canActivate(context)
    if (!isAccessValid) {
      res.clearCookie(EnumCookieKeys.ACCESS_TOKEN)
    }

    if (isAccessValid instanceof Observable) {
      return lastValueFrom(isAccessValid)
    }

    return isAccessValid
  }

  handleRequest<TUser = unknown>(
    err: unknown,
    user: unknown,
    info: unknown,
    context: ExecutionContext,
    status?: unknown,
  ): TUser {
    if (info instanceof Error && info.message.includes('No auth token')) {
      throw new AppBadRequestException({
        code: 'AUT4002',
      })
    }
    if (info instanceof JsonWebTokenError) {
      throw new AppBadRequestException({
        code: 'AUT4003',
      })
    }
    if (info instanceof Error && info.message.includes('jwt expired')) {
      throw new AppBadRequestException({
        code: 'AUT4004',
      })
    }
    return super.handleRequest(err, user, info, context, status)
  }
}
