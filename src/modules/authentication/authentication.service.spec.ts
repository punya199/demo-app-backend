import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { Request, Response } from 'express'
import { InMemoryKvStore } from '../kv-store/in-memory-kv-store'
import { KvStore } from '../kv-store/kv-store'
import { AUTHENTICATION_MODULE_OPTIONS, EnumCookieKeys } from './authentication.constant'
import { IAuthenticationModuleOptions } from './authentication.module'
import { AuthenticationService, IBaseTokenPayload } from './authentication.service'

describe('AuthenticationService', () => {
  let service: AuthenticationService
  const res = { cookie: jest.fn(), clearCookie: jest.fn() } as unknown as Response

  const options: IAuthenticationModuleOptions = {
    jwt: {
      secret: 'test-secret',
      expiresIn: '1d',
      refreshExpiresIn: '7d',
      renewRefreshToken: false,
    },
  }

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthenticationService,
        { provide: JwtService, useValue: new JwtService({ secret: options.jwt.secret }) },
        { provide: KvStore, useValue: new InMemoryKvStore() },
        { provide: AUTHENTICATION_MODULE_OPTIONS, useValue: options },
      ],
    }).compile()

    service = module.get(AuthenticationService)
  })

  const login = async () => {
    const tokens = await service.signToken({ 'user-id': 'user-1' })
    const payload = service.decodeJwt<IBaseTokenPayload>(tokens.accessToken)
    return { tokens, payload, req: { user: payload } as unknown as Request }
  }

  it('allow-lists issued tokens', async () => {
    const { tokens, payload } = await login()

    await expect(
      service.getStoredToken('user-1', payload.jti, EnumCookieKeys.ACCESS_TOKEN)
    ).resolves.toBe(tokens.accessToken)
  })

  it('invalidates both tokens on logout', async () => {
    const { payload, req } = await login()

    await service.clearToken(req, res)

    for (const type of [EnumCookieKeys.ACCESS_TOKEN, EnumCookieKeys.REFRESH_TOKEN]) {
      await expect(service.getStoredToken('user-1', payload.jti, type)).resolves.toBeNull()
    }
  })

  it('refresh returns the stored refresh token and a new allow-listed access token', async () => {
    const { tokens, payload, req } = await login()

    const result = await service.refreshToken(req, res)

    expect(result?.refreshToken).toBe(tokens.refreshToken)
    await expect(
      service.getStoredToken('user-1', payload.jti, EnumCookieKeys.ACCESS_TOKEN)
    ).resolves.toBe(result?.accessToken)
  })
})
