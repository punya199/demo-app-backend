// user.service.ts
import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { LoginDto } from './dto/login.dto'
import { Payload } from './jwt.strategy'
import { User } from './user.entity'

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private jwtService: JwtService
  ) {}

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({
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
  async getMe(userId: number) {
    const user = await this.userRepo.findOne({
      where: {
        id: userId,
      },
    })
    return { user }
  }
}
