// user.service.ts
import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectRepository } from '@nestjs/typeorm'
import { ILike, Repository } from 'typeorm'
import { UserEntity } from '../../db/entities/user.entity'
import { GetUserOptionsParamsDto } from './dto/get-user-options.dto'
import { LoginDto } from './dto/login.dto'
import { Payload } from './jwt.strategy'

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private userRepo: Repository<UserEntity>,
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

    const payload: Payload = { sub: user.id, username: user.username }
    return { accessToken: await this.jwtService.signAsync(payload), user }
  }
  async getMe(userId: string) {
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
    return { user }
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
}
