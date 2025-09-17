import { InjectRedis } from '@nestjs-modules/ioredis'
import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import Redis from 'ioredis'
import { pick } from 'lodash'
import { Repository } from 'typeorm'
import { PermissionsEntity } from '../../db/entities/permissions'
import { EnumUserStatus, UserEntity } from '../../db/entities/user.entity'
import { AuthenticationService } from '../authentication/authentication.service'
import { LoginDto } from '../user/dto/login.dto'
import { IAppJwtPayload } from './auth.interface'

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private userRepo: Repository<UserEntity>,
    @InjectRedis()
    private redis: Redis,
    private readonly authenticationService: AuthenticationService,
    @InjectRepository(PermissionsEntity)
    private permissionsRepo: Repository<PermissionsEntity>
  ) {}

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
        password: true,
      },
      where: {
        username: dto.username,
      },
    })

    if (!user) {
      throw new Error('ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง')
    }

    if (user.status === EnumUserStatus.INACTIVE) {
      throw new BadRequestException('บัญชีนี้ถูกปิดการใช้งาน')
    }

    if (user.status === EnumUserStatus.BLOCKED) {
      throw new BadRequestException('บัญชีนี้ถูกระงับการใช้งาน')
    }

    if (user.password !== dto.password) {
      const failedCount = await this.updateWrongPassword(user.id)
      if (failedCount >= 5) {
        user.status = EnumUserStatus.BLOCKED
        await this.userRepo.save(user)
        throw new BadRequestException('ถูกจำกัดการเข้าถึง กรุณาติดต่อผู้ดูแลระบบ')
      } else {
        throw new BadRequestException('ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง')
      }
    }

    const payload: IAppJwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      'user-id': user.id,
      jti: user.id,
    }

    const { accessToken, refreshToken } =
      await this.authenticationService.signToken<IAppJwtPayload>(payload)
    return { accessToken, refreshToken, user: pick(user, ['id', 'username', 'role']) }
  }

  private async updateWrongPassword(userId: string) {
    const redisKey = `login_password_failed:${userId}`
    const wrongPassword = await this.redis.get(redisKey)
    const wrongPasswordNumber = +(wrongPassword || 0)

    if (!wrongPasswordNumber) {
      await this.redis.set(redisKey, 1, 'EX', 5 * 60)
    } else {
      await this.redis.incr(redisKey)
    }
    const result = await this.redis.get(redisKey)
    return +(result || 0)
  }
}
