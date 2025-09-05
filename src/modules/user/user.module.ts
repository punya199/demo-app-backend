import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PermissionsEntity } from '../../db/entities/permissions'
import { UserEntity } from '../../db/entities/user.entity'
import { UserController } from './user.controller'
import { UserService } from './user.service'

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, PermissionsEntity])],
  providers: [UserService],
  controllers: [UserController],
})
export class UserModule {}
