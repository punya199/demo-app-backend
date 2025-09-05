import { InjectRedis } from '@nestjs-modules/ioredis'
import { Inject, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import dayjs from 'dayjs'
import { CookieOptions, Request, Response } from 'express'
import { Redis } from 'ioredis'
import { get, omit, set } from 'lodash'
import ms from 'ms'
import { AUTHENTICATION_MODULE_OPTIONS, EnumCookieKeys } from './authentication.constant'
import { IAuthenticationModuleOptions } from './authentication.module'
import { AzureAdHelper } from './utils/azure-ad-helper'

export interface IBaseTokenPayload {
  jti: string
  'user-id': string
}

@Injectable()
export class AuthenticationService {
  constructor(
    private readonly jwtService: JwtService,
    @InjectRedis() private readonly redis: Redis,
    @Inject(AUTHENTICATION_MODULE_OPTIONS)
    private readonly options: IAuthenticationModuleOptions
  ) {}

  decodeJwt(token: string) {
    return this.jwtService.decode(token)
  }

  verifyAzureAdIdToken(token: string) {
    const azureAdHelper = new AzureAdHelper(this.options.azureAd?.tenantId ?? '')
    return azureAdHelper.verifyToken(token)
  }

  async signToken<T extends IBaseTokenPayload>(payload: Omit<T, 'jti'>) {
    return this._signToken(payload)
  }

  async refreshToken(req: Request, res: Response) {
    const renewRefreshToken = this.options.jwt.renewRefreshToken
    const user = get(req, 'user')
    const userId = get(user, 'user-id')
    const jti = get(user, 'jti')

    if (!user) {
      return
    }

    const payload = omit(user, ['iat', 'exp']) as IBaseTokenPayload

    await this.delTokenFromRedis(userId, jti, EnumCookieKeys.ACCESS_TOKEN)

    const result = await this._signToken(payload, jti, renewRefreshToken)

    this.setCookie(res, EnumCookieKeys.ACCESS_TOKEN, result.accessToken)
    if (renewRefreshToken) {
      this.setCookie(res, EnumCookieKeys.REFRESH_TOKEN, result.refreshToken)
      await this.delTokenFromRedis(userId, jti, EnumCookieKeys.REFRESH_TOKEN)
    }
    return result
  }

  async clearToken(req: Request, res: Response) {
    const user = get(req, 'user')
    const userId = get(user, 'user-id')
    const jti = get(user, 'jti')

    await this.delTokenFromRedis(userId, jti, EnumCookieKeys.ACCESS_TOKEN)
    await this.delTokenFromRedis(userId, jti, EnumCookieKeys.REFRESH_TOKEN)

    this.clearCookie(res)
  }

  getTokenFromRedis(userId: string, jti: string, type: EnumCookieKeys) {
    return this.redis.get(this.getTokenKey(userId, jti, type))
  }

  setTokenToRedis(userId: string, jti: string, type: EnumCookieKeys, token: string) {
    return this.redis.set(
      this.getTokenKey(userId, jti, type),
      token,
      'PX',
      type === EnumCookieKeys.ACCESS_TOKEN
        ? ms(this.options.jwt.expiresIn)
        : ms(this.options.jwt.refreshExpiresIn)
    )
  }

  delTokenFromRedis(userId: string, jti: string, type: EnumCookieKeys) {
    return this.redis.del(this.getTokenKey(userId, jti, type))
  }

  setCookie(res: Response, type: EnumCookieKeys, token: string, options?: CookieOptions) {
    res.cookie(
      type === EnumCookieKeys.ACCESS_TOKEN
        ? EnumCookieKeys.ACCESS_TOKEN
        : EnumCookieKeys.REFRESH_TOKEN,
      token,
      {
        ...this.options.cookies,
        ...options,
        maxAge: ms(this.options.jwt.refreshExpiresIn),
      }
    )
    return res
  }

  clearCookie(res: Response) {
    res.clearCookie(EnumCookieKeys.ACCESS_TOKEN)
    res.clearCookie(EnumCookieKeys.REFRESH_TOKEN)
    return res
  }

  private async _signToken<T extends IBaseTokenPayload>(
    payload: Omit<T, 'jti'>,
    _jti = dayjs().format('YYYYMMDDTHHmmss'),
    renewRefreshToken = true
  ) {
    const jti = renewRefreshToken ? dayjs().format('YYYYMMDDTHHmmss') : _jti

    set(payload, 'jti', jti)

    const userId = payload['user-id']

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.options.jwt.expiresIn,
    })

    await this.setTokenToRedis(userId, jti, EnumCookieKeys.ACCESS_TOKEN, accessToken)

    let refreshToken: string
    if (renewRefreshToken) {
      refreshToken = this.jwtService.sign(payload, {
        expiresIn: this.options.jwt.refreshExpiresIn,
      })
      await this.setTokenToRedis(userId, jti, EnumCookieKeys.REFRESH_TOKEN, refreshToken)
    } else {
      refreshToken = (await this.getTokenFromRedis(userId, jti, EnumCookieKeys.REFRESH_TOKEN)) ?? ''
    }

    return {
      accessToken,
      refreshToken,
    }
  }

  private getTokenKey(userId: string, jti: string, type: EnumCookieKeys) {
    return `${this.options.redis.prefix}:login_token:${userId}:${jti}:${type}`
  }
}
