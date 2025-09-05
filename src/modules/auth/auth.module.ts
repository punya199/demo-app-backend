import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import appConfig from '../../config/app-config'
import { UserEntity } from '../../db/entities/user.entity'
import { AuthenticationModule } from '../authentication/authentication.module'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    AuthenticationModule.register({
      jwt: {
        secret: appConfig.JWT_SECRET,
        expiresIn: appConfig.JWT_EXPIRES_IN,
        refreshExpiresIn: appConfig.JWT_REFRESH_EXPIRES_IN,
        renewRefreshToken: appConfig.JWT_RENEW_REFRESH_TOKEN,
      },
      redis: {
        host: appConfig.REDIS_HOST,
        port: appConfig.REDIS_PORT,
        prefix: appConfig.REDIS_PREFIX,
      },
      cookies: {
        httpOnly: appConfig.COOKIE_HTTP_ONLY,
        secure: appConfig.COOKIE_SECURE,
        sameSite: appConfig.COOKIE_SAME_SITE,
      },
    }),
  ],

  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
