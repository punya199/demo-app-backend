import { Inject, Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { Request } from 'express'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { AppBadRequestException } from '../../../utils/exception'
import {
  AUTHENTICATION_MODULE_OPTIONS,
  EnumCookieKeys,
  EnumJwtStrategy,
} from '../authentication.constant'
import { IAuthenticationModuleOptions } from '../authentication.module'
import { AuthenticationService, IBaseTokenPayload } from '../authentication.service'

@Injectable()
export class JwtAccessTokenStrategy extends PassportStrategy(
  Strategy,
  EnumJwtStrategy.ACCESS_TOKEN
) {
  constructor(
    @Inject(AUTHENTICATION_MODULE_OPTIONS)
    private readonly options: IAuthenticationModuleOptions,
    private readonly authenticationService: AuthenticationService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([JwtAccessTokenStrategy.getExtractJWT]),
      ignoreExpiration: false,
      secretOrKey: options.jwt.secret,
    })
  }

  async validate(payload: IBaseTokenPayload) {
    const token = await this.authenticationService.getTokenFromRedis(
      payload['user-id'],
      payload.jti,
      EnumCookieKeys.ACCESS_TOKEN
    )
    if (!token) {
      throw new AppBadRequestException({ code: 'AUT4001' })
    }

    return payload
  }

  private static getExtractJWT(req: Request): string | null {
    if (req.cookies?.[EnumCookieKeys.ACCESS_TOKEN]) {
      return req.cookies[EnumCookieKeys.ACCESS_TOKEN]
    }
    return null
  }
}
