import { Inject, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import dayjs from 'dayjs'
import { CookieOptions, Request, Response } from 'express'
import { get, omit, set } from 'lodash'
import ms from 'ms'
import { KvStore } from '../kv-store/kv-store'
import { AUTHENTICATION_MODULE_OPTIONS, EnumCookieKeys } from './authentication.constant'
import { IAuthenticationModuleOptions } from './authentication.module'

export interface IBaseTokenPayload {
  jti: string
  'user-id': string
}

@Injectable()
export class AuthenticationService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly kv: KvStore,
    @Inject(AUTHENTICATION_MODULE_OPTIONS)
    private readonly options: IAuthenticationModuleOptions
  ) {}

  decodeJwt<D extends IBaseTokenPayload>(token: string) {
    return this.jwtService.decode<D>(token)
  }

  async signToken<T extends IBaseTokenPayload>(payload: Omit<T, 'jti'>) {
    return this._signToken(payload)
  }

  async refreshToken(req: Request, res: Response) {
    const renewRefreshToken = this.options.jwt.renewRefreshToken
    const user = get(req, 'user') as IBaseTokenPayload
    const userId = user['user-id']
    const jti = user.jti

    if (!user) {
      return
    }

    const payload = omit(user, ['iat', 'exp']) as IBaseTokenPayload

    await this.deleteStoredToken(userId, jti, EnumCookieKeys.ACCESS_TOKEN)

    const result = await this._signToken(payload, jti, renewRefreshToken)

    this.setCookie(res, EnumCookieKeys.ACCESS_TOKEN, result.accessToken)
    if (renewRefreshToken) {
      this.setCookie(res, EnumCookieKeys.REFRESH_TOKEN, result.refreshToken)
      await this.deleteStoredToken(userId, jti, EnumCookieKeys.REFRESH_TOKEN)
    }
    return result
  }

  async clearToken(req: Request, res: Response) {
    const user = get(req, 'user') as IBaseTokenPayload
    const userId = user['user-id']
    const jti = user.jti

    await this.deleteStoredToken(userId, jti, EnumCookieKeys.ACCESS_TOKEN)
    await this.deleteStoredToken(userId, jti, EnumCookieKeys.REFRESH_TOKEN)

    this.clearCookie(res)
  }

  getStoredToken(userId: string, jti: string, type: EnumCookieKeys) {
    return this.kv.get(this.getTokenKey(userId, jti, type))
  }

  storeToken(userId: string, jti: string, type: EnumCookieKeys, token: string) {
    return this.kv.set(
      this.getTokenKey(userId, jti, type),
      token,
      type === EnumCookieKeys.ACCESS_TOKEN
        ? ms(this.options.jwt.expiresIn)
        : ms(this.options.jwt.refreshExpiresIn)
    )
  }

  deleteStoredToken(userId: string, jti: string, type: EnumCookieKeys) {
    return this.kv.del(this.getTokenKey(userId, jti, type))
  }

  // maxAge defaults to the JWT refresh expiry - correct for ACCESS_TOKEN/REFRESH_TOKEN, but any
  // other cookie type (e.g. REMEMBER_DEVICE) MUST pass its own `options.maxAge` explicitly.
  setCookie(res: Response, type: EnumCookieKeys, token: string, options?: CookieOptions) {
    res.cookie(type, token, {
      ...this.options.cookies,
      maxAge: ms(this.options.jwt.refreshExpiresIn),
      ...options,
    })
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

    await this.storeToken(userId, jti, EnumCookieKeys.ACCESS_TOKEN, accessToken)

    let refreshToken: string
    if (renewRefreshToken) {
      refreshToken = this.jwtService.sign(payload, {
        expiresIn: this.options.jwt.refreshExpiresIn,
      })
      await this.storeToken(userId, jti, EnumCookieKeys.REFRESH_TOKEN, refreshToken)
    } else {
      refreshToken = (await this.getStoredToken(userId, jti, EnumCookieKeys.REFRESH_TOKEN)) ?? ''
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
