// user.service.ts
import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { plainToInstance } from 'class-transformer'
import { EntityManager, ILike, In, Not, Repository } from 'typeorm'
import { PermissionsEntity } from '../../db/entities/permissions'
import { UserEntity, UserRole } from '../../db/entities/user.entity'
import { permissionActionHelper } from '../../utils/permission-helper'
import { EditRoleUserDto } from './dto/edit-role-user'
import { EditUserPermissionsDto } from './dto/edit-user-permissions.dto'
import { GetMeResponseDto } from './dto/get-me.dto'
import { GetUserOptionsParamsDto } from './dto/get-user-options.dto'
import { RegisterUserDto } from './dto/register-user'

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private userRepo: Repository<UserEntity>,
    @InjectRepository(PermissionsEntity)
    private permissionsRepo: Repository<PermissionsEntity>
  ) {}

  async getMe(userId: string) {
    console.log('userId', userId)
    const user = await this.userRepo
      .createQueryBuilder('u')
      .select('u.id')
      .addSelect('u.username')
      .addSelect('u.role')
      .where('u.id = :userId', { userId })
      .getOne()

    const permissions = await this.permissionsRepo
      .createQueryBuilder('p')
      .select('p.id')
      .addSelect('p.featureName')
      .addSelect('p.action')
      .where('p.user_id = :userId', { userId })
      .getMany()

    const userResponse = plainToInstance(GetMeResponseDto, {
      ...user,
      permissions: permissions.map(permission => ({
        ...permission,
        action: permissionActionHelper(permission.action),
      })),
    })

    return { user: userResponse }
  }

  async getUserOptions(params: GetUserOptionsParamsDto) {
    const { search } = params

    const users = await this.userRepo.find({
      select: {
        id: true,
        username: true,
      },
      where: {
        username: search ? ILike(`%${search}%`) : undefined,
      },
    })

    return {
      options: users.map(user => ({
        label: user.username,
        value: user.id,
      })),
    }
  }

  async getUsers() {
    const users = await this.userRepo.find({
      order: {
        createdAt: 'DESC',
      },
    })
    return { users }
  }

  async registerUser(dto: RegisterUserDto) {
    const checkUser = await this.userRepo.findOne({
      where: { username: dto.username },
    })
    if (checkUser) {
      throw new HttpException(
        {
          message: 'มีชื่อนี้อยู่แล้ว',
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const user = this.userRepo.create({
      ...dto,
      role: UserRole.USER,
    })
    return this.userRepo.save(user)
  }
  async editRoleUser(userId: string, dto: EditRoleUserDto) {
    const user = await this.userRepo.findOne({
      select: {
        id: true,
        username: true,
        role: true,
      },
      where: {
        id: userId,
      },
    })
    if (user) {
      await this.userRepo.update(
        {
          id: userId,
        },
        dto
      )
      return { user }
    }
    return { user }
  }
  async getUser(userId: string) {
    const user = await this.userRepo.findOne({
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
      },
      where: { id: userId },
    })
    return { user }
  }

  async getUserPermissions(userId: string) {
    const permissions = await this.permissionsRepo.find({
      select: {
        id: true,
        featureName: true,
        action: true,
      },
      where: { userId },
    })
    return {
      permissions: permissions.map(permission => ({
        ...permission,
        action: permissionActionHelper(permission.action),
      })),
    }
  }

  async editUserPermissions(userId: string, params: EditUserPermissionsDto, etm: EntityManager) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
    })
    if (user) {
      await etm.softDelete(PermissionsEntity, {
        userId,
        featureName: Not(In(params.permissions.map(permission => permission.featureName))),
      })

      await etm
        .createQueryBuilder()
        .insert()
        .into(PermissionsEntity)
        .values(
          params.permissions.map(permission => ({
            userId,
            featureName: permission.featureName,
            action: [
              permission.action.canRead ? '1' : '0',
              permission.action.canCreate ? '1' : '0',
              permission.action.canUpdate ? '1' : '0',
              permission.action.canDelete ? '1' : '0',
            ].join(''),
          }))
        )
        .orUpdate(['action'], ['user_id', 'feature_name'], {
          indexPredicate: 'deleted_at IS NULL',
          skipUpdateIfNoValuesChanged: true,
        })
        .execute()
    }
  }
}
