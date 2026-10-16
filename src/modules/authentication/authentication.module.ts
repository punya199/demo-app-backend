import { DynamicModule, Global, Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { CookieOptions } from 'express'
import ms from 'ms'
import { AUTHENTICATION_MODULE_OPTIONS } from './authentication.constant'
import { AuthenticationService } from './authentication.service'
import { JwtAccessTokenStrategy } from './strategy/jwt-access-token.strategy'
import { JwtRefreshTokenStrategy } from './strategy/jwt-refresh-token.strategy'

export interface IAuthenticationModuleOptions {
  jwt: {
    secret: string
    expiresIn: ms.StringValue
    refreshExpiresIn: ms.StringValue
    /**
     * @description If true, the refresh token will be renewed with new expiration time.
     * @default true
     */
    renewRefreshToken?: boolean
  }
  cookies?: CookieOptions
  azureAd?: {
    tenantId: string
  }
}

@Global()
@Module({})
export class AuthenticationModule {
  static register(options: IAuthenticationModuleOptions): DynamicModule {
    return {
      module: AuthenticationModule,
      imports: [
        JwtModule.register({
          global: true,
          secret: options.jwt.secret,
        }),
      ],
      controllers: [],
      providers: [
        {
          provide: AUTHENTICATION_MODULE_OPTIONS,
          useValue: options,
        },
        AuthenticationService,
        JwtAccessTokenStrategy,
        JwtRefreshTokenStrategy,
      ],
      exports: [AuthenticationService],
    }
  }
}
