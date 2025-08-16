// user.service.ts
import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectRepository } from '@nestjs/typeorm'
import { plainToInstance } from 'class-transformer'
import { ILike, Repository } from 'typeorm'
import { PermissionsEntity } from '../../db/entities/permissions'
import { UserEntity, UserRole } from '../../db/entities/user.entity'
import { permissionActionHelper } from '../../utils/permission-helper'
import { EditRoleUserDto } from './dto/edit-role-user'
import { GetMeResponseDto } from './dto/get-me.dto'
import { GetUserOptionsParamsDto } from './dto/get-user-options.dto'
import { LoginDto } from './dto/login.dto'
import { RegisterUserDto } from './dto/register-user'
import { Payload } from './jwt.strategy'

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private userRepo: Repository<UserEntity>,
    @InjectRepository(PermissionsEntity)
    private permissionsRepo: Repository<PermissionsEntity>,
    private jwtService: JwtService
  ) {}

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({
      select: {
        id: true,
        username: true,
        role: true,
      },
      where: {
        username: dto.username,
        password: dto.password,
      },
    })

    if (!user) {
      throw new Error('Invalid credentials')
    }

    const payload: Payload = { sub: user.id, username: user.username, role: user.role }
    return { accessToken: await this.jwtService.signAsync(payload), user }
  }
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
}
