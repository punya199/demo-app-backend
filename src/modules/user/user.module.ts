import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PermissionsEntity } from '../../db/entities/permissions'
import { UserEntity } from '../../db/entities/user.entity'
import { jwtConstants } from './constants'
import { JwtStrategy } from './jwt.strategy'
import { UserController } from './user.controller'
import { UserService } from './user.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, PermissionsEntity]),
    PassportModule,
    JwtModule.register({
      global: true,
      secret: jwtConstants.secret,
      signOptions: { expiresIn: jwtConstants.expiresIn, algorithm: 'HS256' },
    }),
  ],
  providers: [UserService, JwtStrategy],
  controllers: [UserController],
})
export class UserModule {}
