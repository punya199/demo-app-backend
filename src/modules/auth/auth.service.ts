import { InjectRedis } from '@nestjs-modules/ioredis'
import { BadRequestException, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectRepository } from '@nestjs/typeorm'
import { randomBytes } from 'crypto'
import Redis from 'ioredis'
import { pick } from 'lodash'
import { authenticator } from 'otplib'
import * as QRCode from 'qrcode'
import { Repository } from 'typeorm'
import { PermissionsEntity } from '../../db/entities/permissions'
import { EnumUserStatus, UserEntity } from '../../db/entities/user.entity'
import { AppBadRequestException } from '../../utils/exception'
import { comparePassword, hashPassword } from '../../utils/password-helper'
import { decryptTotpSecret, encryptTotpSecret } from '../../utils/totp-crypto'
import { AuthenticationService } from '../authentication/authentication.service'
import { LoginDto } from '../user/dto/login.dto'
import { IAppJwtPayload } from './auth.interface'
import { TWO_FACTOR_PENDING_SCOPE } from './two-factor-pending.guard'

const TOTP_ISSUER = 'YaYa'
const BACKUP_CODE_COUNT = 10
const TWO_FACTOR_PENDING_EXPIRES_IN = '5m'
export const REMEMBER_DEVICE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private userRepo: Repository<UserEntity>,
    @InjectRedis()
    private redis: Redis,
    private readonly authenticationService: AuthenticationService,
    private readonly jwtService: JwtService,
    @InjectRepository(PermissionsEntity)
    private permissionsRepo: Repository<PermissionsEntity>
  ) {}

  async login(dto: LoginDto, rememberDeviceToken?: string) {
    const user = await this.userRepo.findOne({
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
        password: true,
        twoFactorEnabled: true,
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

    if (!(await comparePassword(dto.password, user.password))) {
      const failedCount = await this.updateWrongPassword(user.id)
      if (failedCount >= 5) {
        user.status = EnumUserStatus.BLOCKED
        await this.userRepo.save(user)
        throw new BadRequestException('ถูกจำกัดการเข้าถึง กรุณาติดต่อผู้ดูแลระบบ')
      } else {
        throw new BadRequestException('ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง')
      }
    }

    if (user.twoFactorEnabled) {
      if (rememberDeviceToken && (await this.isDeviceRemembered(user.id, rememberDeviceToken))) {
        return { twoFactorRequired: false as const, ...(await this.issueTokens(user)) }
      }

      const pendingToken = this.jwtService.sign(
        { sub: user.id, scope: TWO_FACTOR_PENDING_SCOPE },
        { expiresIn: TWO_FACTOR_PENDING_EXPIRES_IN }
      )
      return { twoFactorRequired: true as const, pendingToken }
    }

    return { twoFactorRequired: false as const, ...(await this.issueTokens(user)) }
  }

  async completeTwoFactorLogin(userId: string, code: string) {
    const user = await this.userRepo.findOne({
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
        backupCodes: true,
      },
      where: { id: userId },
    })

    // Re-check status: the pending token can outlive a block/deactivation that happens
    // after login() issued it (account BLOCKED mid-window, admin deactivation, etc.).
    if (!user?.twoFactorEnabled || !user.twoFactorSecret || user.status !== EnumUserStatus.ACTIVE) {
      throw new AppBadRequestException({ code: 'AUT4012' })
    }

    const writes: Promise<unknown>[] = []

    if (!authenticator.check(code, decryptTotpSecret(user.twoFactorSecret))) {
      const backupCodes = user.backupCodes ?? []
      const usedIndex = await this.findUnusedBackupCodeIndex(backupCodes, code)
      if (usedIndex === -1) {
        throw new AppBadRequestException({ code: 'AUT4013' })
      }

      // Claim the specific code atomically before consuming it: two concurrent requests
      // with the same backup code would otherwise both pass the check above (stale read)
      // and both redeem it. Only the request that wins the claim proceeds.
      const claimed = await this.redis.set(
        this.getBackupCodeClaimKey(user.id, backupCodes[usedIndex].hash),
        '1',
        'EX',
        60,
        'NX'
      )
      if (!claimed) {
        throw new AppBadRequestException({ code: 'AUT4013' })
      }

      const consumedBackupCodes = [...backupCodes]
      consumedBackupCodes[usedIndex] = {
        ...consumedBackupCodes[usedIndex],
        usedAt: new Date().toISOString(),
      }
      writes.push(this.userRepo.save({ id: user.id, backupCodes: consumedBackupCodes }))
    }

    const rememberDeviceToken = randomBytes(32).toString('hex')
    writes.push(
      this.redis.set(
        this.getRememberDeviceKey(user.id, rememberDeviceToken),
        '1',
        'PX',
        REMEMBER_DEVICE_MAX_AGE_MS
      )
    )

    const [tokens] = await Promise.all([this.issueTokens(user), ...writes])

    return { ...tokens, rememberDeviceToken }
  }

  private async findUnusedBackupCodeIndex(
    backupCodes: { hash: string; usedAt: string | null }[],
    code: string
  ) {
    for (let i = 0; i < backupCodes.length; i++) {
      if (!backupCodes[i].usedAt && (await comparePassword(code, backupCodes[i].hash))) {
        return i
      }
    }
    return -1
  }

  private getBackupCodeClaimKey(userId: string, hash: string) {
    return `backup_code_claim:${userId}:${hash}`
  }

  private async isDeviceRemembered(userId: string, token: string) {
    return Boolean(await this.redis.get(this.getRememberDeviceKey(userId, token)))
  }

  private getRememberDeviceKey(userId: string, token: string) {
    return `remember_device:${userId}:${token}`
  }

  private async issueTokens(user: Pick<UserEntity, 'id' | 'username' | 'role'>) {
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

  async startTwoFactorEnrollment(userId: string, username: string) {
    const secret = authenticator.generateSecret()

    // save(), not update() - update() bypasses AuditSubscriber and leaves updaterId/updatedAt stale.
    await this.userRepo.save({ id: userId, twoFactorSecret: encryptTotpSecret(secret) })

    const otpauthUri = authenticator.keyuri(username, TOTP_ISSUER, secret)
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUri)

    return { secret, qrCodeDataUrl }
  }

  async confirmTwoFactorEnrollment(userId: string, code: string) {
    const user = await this.userRepo.findOne({
      select: { id: true, twoFactorSecret: true },
      where: { id: userId },
    })

    if (
      !user?.twoFactorSecret ||
      !authenticator.check(code, decryptTotpSecret(user.twoFactorSecret))
    ) {
      throw new AppBadRequestException({ code: 'AUT4010' })
    }

    const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, () =>
      randomBytes(5).toString('hex').toUpperCase()
    )
    const hashedBackupCodes = await Promise.all(
      backupCodes.map(async backupCode => ({ hash: await hashPassword(backupCode), usedAt: null }))
    )

    await this.userRepo.save({
      id: userId,
      twoFactorEnabled: true,
      backupCodes: hashedBackupCodes,
    })

    return { backupCodes }
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
