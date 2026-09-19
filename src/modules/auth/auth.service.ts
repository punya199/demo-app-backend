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

    // Separate cooldown from the password-lockout counter: a mistyped 6-digit code is far
    // more likely than an attack, so this throttles instead of blocking the account outright.
    if (await this.isTwoFactorVerifyLocked(userId)) {
      throw new AppBadRequestException({ code: 'AUT4014' })
    }

    const writes: Promise<unknown>[] = []

    if (!authenticator.check(code, decryptTotpSecret(user.twoFactorSecret))) {
      const backupCodes = user.backupCodes ?? []
      const usedIndex = await this.findUnusedBackupCodeIndex(backupCodes, code)
      if (usedIndex === -1) {
        await this.recordTwoFactorVerifyFailure(userId)
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
        await this.recordTwoFactorVerifyFailure(userId)
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
      ),
      // Tracked in a per-user set (not just KEYS-scanned) so disableTwoFactor can revoke every
      // remembered device in one shot instead of leaving stale tokens that survive a re-enroll.
      this.redis.sadd(this.getRememberDeviceTokensSetKey(user.id), rememberDeviceToken),
      this.redis.expire(
        this.getRememberDeviceTokensSetKey(user.id),
        REMEMBER_DEVICE_MAX_AGE_MS / 1000
      ),
      this.redis.del(this.getTwoFactorVerifyFailedKey(userId))
    )

    const [tokens] = await Promise.all([this.issueTokens(user), ...writes])

    return { ...tokens, rememberDeviceToken }
  }

  private async recordTwoFactorVerifyFailure(userId: string) {
    const count = await this.bumpFailureCounter(this.getTwoFactorVerifyFailedKey(userId), 60)
    if (count >= 5) {
      await this.redis.set(this.getTwoFactorVerifyLockKey(userId), '1', 'EX', 60)
    }
  }

  // Atomic INCR (auto-initializes to 1) + EXPIRE only on that first increment, so concurrent
  // callers can't race a get-then-set/incr into undercounting failures past a lockout threshold.
  private async bumpFailureCounter(key: string, ttlSeconds: number) {
    const count = await this.redis.incr(key)
    if (count === 1) {
      await this.redis.expire(key, ttlSeconds)
    }
    return count
  }

  private async isTwoFactorVerifyLocked(userId: string) {
    return Boolean(await this.redis.get(this.getTwoFactorVerifyLockKey(userId)))
  }

  private getTwoFactorVerifyFailedKey(userId: string) {
    return `two_factor_verify_failed:${userId}`
  }

  private getTwoFactorVerifyLockKey(userId: string) {
    return `two_factor_verify_locked:${userId}`
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

  private getRememberDeviceTokensSetKey(userId: string) {
    return `remember_device_tokens:${userId}`
  }

  private async revokeRememberedDevices(userId: string) {
    const tokens = await this.redis.smembers(this.getRememberDeviceTokensSetKey(userId))
    if (tokens.length) {
      await this.redis.del(...tokens.map(token => this.getRememberDeviceKey(userId, token)))
    }
    await this.redis.del(this.getRememberDeviceTokensSetKey(userId))
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

  async disableTwoFactor(userId: string, code: string) {
    const user = await this.userRepo.findOne({
      select: { id: true, twoFactorEnabled: true, twoFactorSecret: true },
      where: { id: userId },
    })

    if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
      throw new AppBadRequestException({ code: 'AUT4015' })
    }

    // Same lock/counter completeTwoFactorLogin uses: a stolen session token without the TOTP
    // secret shouldn't get unlimited guesses to turn 2FA off.
    if (await this.isTwoFactorVerifyLocked(userId)) {
      throw new AppBadRequestException({ code: 'AUT4014' })
    }

    if (!authenticator.check(code, decryptTotpSecret(user.twoFactorSecret))) {
      await this.recordTwoFactorVerifyFailure(userId)
      throw new AppBadRequestException({ code: 'AUT4015' })
    }

    await Promise.all([
      this.userRepo.save({
        id: userId,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        backupCodes: null,
      }),
      this.revokeRememberedDevices(userId),
      this.redis.del(this.getTwoFactorVerifyFailedKey(userId)),
    ])
  }

  private async updateWrongPassword(userId: string) {
    return this.bumpFailureCounter(`login_password_failed:${userId}`, 5 * 60)
  }
}
