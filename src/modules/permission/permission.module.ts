import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PermissionsEntity } from '../../db/entities/permissions'
import { PermissionController } from './permission.controller'
import { PermissionService } from './permission.service'

@Module({
  imports: [TypeOrmModule.forFeature([PermissionsEntity])],
  controllers: [PermissionController],
  providers: [PermissionService],
})
export class PermissionModule {}
