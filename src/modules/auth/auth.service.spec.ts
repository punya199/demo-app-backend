import { BadRequestException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { authenticator } from 'otplib'
import { EnumUserStatus, UserEntity, UserRole } from '../../db/entities/user.entity'
import { PermissionsEntity } from '../../db/entities/permissions'
import appConfig from '../../config/app-config'
import * as passwordHelper from '../../utils/password-helper'
import { encryptTotpSecret } from '../../utils/totp-crypto'
import { AuthenticationService } from '../authentication/authentication.service'
import { InMemoryKvStore } from '../kv-store/in-memory-kv-store'
import { KvStore } from '../kv-store/kv-store'
import { AuthService } from './auth.service'

describe('AuthService', () => {
  let service: AuthService
  let userRepo: { findOne: jest.Mock; save: jest.Mock }
  let kv: InMemoryKvStore
  let authenticationService: { signToken: jest.Mock }
  let jwtService: { sign: jest.Mock }

  const baseUser = {
    id: 'user-1',
    username: 'tester',
    role: UserRole.USER,
    status: EnumUserStatus.ACTIVE,
    password: 'hashed-password',
  }

  beforeAll(() => {
    appConfig.TOTP_ENCRYPTION_KEY = '0'.repeat(64)
  })

  beforeEach(async () => {
    userRepo = { findOne: jest.fn(), save: jest.fn() }
    kv = new InMemoryKvStore()
    authenticationService = {
      signToken: jest.fn().mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' }),
    }
    jwtService = { sign: jest.fn().mockReturnValue('pending-token') }

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
        { provide: getRepositoryToken(PermissionsEntity), useValue: {} },
        { provide: KvStore, useValue: kv },
        { provide: AuthenticationService, useValue: authenticationService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile()

    service = module.get(AuthService)
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  // Real Date.now() under control; bcrypt/promises still need real nextTick/setImmediate.
  const useFakeClock = () => jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })

  // findOne/save backed by one stored user, so consumed backup codes persist across calls.
  const useStoredUser = (user: Record<string, unknown>) => {
    let stored = { ...user }
    userRepo.findOne.mockImplementation(() => Promise.resolve({ ...stored }))
    userRepo.save.mockImplementation((patch: Record<string, unknown>) => {
      stored = { ...stored, ...patch }
      return Promise.resolve(stored)
    })
  }

  const enrolledUser = (secret: string) => ({
    ...baseUser,
    twoFactorEnabled: true,
    twoFactorSecret: encryptTotpSecret(secret),
  })

  it('logs in successfully with the correct password', async () => {
    userRepo.findOne.mockResolvedValue({ ...baseUser })
    jest.spyOn(passwordHelper, 'comparePassword').mockResolvedValue(true)

    const result = await service.login({ username: 'tester', password: 'correct' })

    if (result.twoFactorRequired) {
      throw new Error('expected full tokens, got a pending 2FA challenge')
    }

    expect(result.user).toEqual({
      id: baseUser.id,
      username: baseUser.username,
      role: baseUser.role,
    })
    expect(result.accessToken).toBe('access')
    expect(authenticationService.signToken).toHaveBeenCalled()
  })

  it('rejects a wrong password without blocking on the first attempts', async () => {
    userRepo.findOne.mockResolvedValue({ ...baseUser })
    jest.spyOn(passwordHelper, 'comparePassword').mockResolvedValue(false)

    await expect(service.login({ username: 'tester', password: 'wrong' })).rejects.toThrow(
      BadRequestException
    )
    expect(userRepo.save).not.toHaveBeenCalled()
  })

  it('blocks the account after the 5th wrong password attempt', async () => {
    userRepo.findOne.mockImplementation(() => Promise.resolve({ ...baseUser }))
    jest.spyOn(passwordHelper, 'comparePassword').mockResolvedValue(false)

    for (let i = 0; i < 4; i++) {
      await expect(service.login({ username: 'tester', password: 'wrong' })).rejects.toThrow(
        BadRequestException
      )
    }
    expect(userRepo.save).not.toHaveBeenCalled()

    await expect(service.login({ username: 'tester', password: 'wrong' })).rejects.toThrow(
      BadRequestException
    )
    expect(userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: EnumUserStatus.BLOCKED })
    )
  })

  it('rejects login for an inactive account before checking the password', async () => {
    userRepo.findOne.mockResolvedValue({ ...baseUser, status: EnumUserStatus.INACTIVE })
    const compareSpy = jest.spyOn(passwordHelper, 'comparePassword')

    await expect(service.login({ username: 'tester', password: 'correct' })).rejects.toThrow(
      BadRequestException
    )
    expect(compareSpy).not.toHaveBeenCalled()
  })

  it('throws when the username does not exist', async () => {
    userRepo.findOne.mockResolvedValue(null)

    await expect(service.login({ username: 'ghost', password: 'anything' })).rejects.toThrow()
  })

  it('returns a pending token instead of full tokens when 2FA is enabled', async () => {
    userRepo.findOne.mockResolvedValue({ ...baseUser, twoFactorEnabled: true })
    jest.spyOn(passwordHelper, 'comparePassword').mockResolvedValue(true)

    const result = await service.login({ username: 'tester', password: 'correct' })

    expect(result).toEqual({ twoFactorRequired: true, pendingToken: 'pending-token' })
    expect(jwtService.sign).toHaveBeenCalledWith(
      { sub: baseUser.id, scope: 'two-factor-pending' },
      { expiresIn: '5m' }
    )
    expect(authenticationService.signToken).not.toHaveBeenCalled()
  })

  it('skips the 2FA challenge when a valid remember-device token is presented', async () => {
    const secret = authenticator.generateSecret()
    userRepo.findOne.mockResolvedValue(enrolledUser(secret))
    jest.spyOn(passwordHelper, 'comparePassword').mockResolvedValue(true)
    const { rememberDeviceToken } = await service.completeTwoFactorLogin(
      baseUser.id,
      authenticator.generate(secret)
    )

    const result = await service.login(
      { username: 'tester', password: 'correct' },
      rememberDeviceToken
    )

    if (result.twoFactorRequired) {
      throw new Error('expected full tokens, got a pending 2FA challenge')
    }
    expect(result.accessToken).toBe('access')
    expect(jwtService.sign).not.toHaveBeenCalled()
  })

  it('still requires the 2FA challenge when the remember-device token is unknown/expired', async () => {
    userRepo.findOne.mockResolvedValue({ ...baseUser, twoFactorEnabled: true })
    jest.spyOn(passwordHelper, 'comparePassword').mockResolvedValue(true)

    const result = await service.login({ username: 'tester', password: 'correct' }, 'stale-token')

    expect(result).toEqual({ twoFactorRequired: true, pendingToken: 'pending-token' })
  })

  describe('completeTwoFactorLogin', () => {
    it('issues full tokens when the code is correct', async () => {
      const secret = authenticator.generateSecret()
      userRepo.findOne.mockResolvedValue({
        ...baseUser,
        twoFactorEnabled: true,
        twoFactorSecret: encryptTotpSecret(secret),
      })

      const result = await service.completeTwoFactorLogin(
        baseUser.id,
        authenticator.generate(secret)
      )

      expect(result.accessToken).toBe('access')
      expect(result.user).toEqual({
        id: baseUser.id,
        username: baseUser.username,
        role: baseUser.role,
      })
      expect(result.rememberDeviceToken).toEqual(expect.any(String))
    })

    it('resets the wrong-code counter after a successful verification', async () => {
      const secret = authenticator.generateSecret()
      userRepo.findOne.mockResolvedValue(enrolledUser(secret))
      const failTimes = async (n: number) => {
        for (let i = 0; i < n; i++) {
          await expect(service.completeTwoFactorLogin(baseUser.id, '000000')).rejects.toThrow(
            BadRequestException
          )
        }
      }

      await failTimes(4)
      await service.completeTwoFactorLogin(baseUser.id, authenticator.generate(secret))
      await failTimes(4)

      await expect(
        service.completeTwoFactorLogin(baseUser.id, authenticator.generate(secret))
      ).resolves.toEqual(expect.objectContaining({ accessToken: 'access' }))
    })

    it('rejects an incorrect code', async () => {
      const secret = authenticator.generateSecret()
      userRepo.findOne.mockResolvedValue({
        ...baseUser,
        twoFactorEnabled: true,
        twoFactorSecret: encryptTotpSecret(secret),
      })

      await expect(service.completeTwoFactorLogin(baseUser.id, '000000')).rejects.toThrow(
        BadRequestException
      )
    })

    it('locks out further attempts after the 5th wrong code, and unlocks after 60s', async () => {
      useFakeClock()
      const secret = authenticator.generateSecret()
      userRepo.findOne.mockResolvedValue(enrolledUser(secret))

      for (let i = 0; i < 5; i++) {
        await expect(service.completeTwoFactorLogin(baseUser.id, '000000')).rejects.toThrow(
          BadRequestException
        )
      }

      await expect(
        service.completeTwoFactorLogin(baseUser.id, authenticator.generate(secret))
      ).rejects.toThrow(BadRequestException)

      jest.advanceTimersByTime(61_000)

      await expect(
        service.completeTwoFactorLogin(baseUser.id, authenticator.generate(secret))
      ).resolves.toEqual(expect.objectContaining({ accessToken: 'access' }))
    })

    it('rejects when the user does not have 2FA enabled', async () => {
      userRepo.findOne.mockResolvedValue({ ...baseUser, twoFactorEnabled: false })

      await expect(service.completeTwoFactorLogin(baseUser.id, '123456')).rejects.toThrow(
        BadRequestException
      )
    })

    it('accepts a valid unused backup code and marks it consumed', async () => {
      const secret = authenticator.generateSecret()
      const backupCode = 'ABCD1234EF'
      const backupCodes = [
        { hash: await passwordHelper.hashPassword(backupCode), usedAt: null },
        { hash: await passwordHelper.hashPassword('OTHERCODE1'), usedAt: null },
      ]
      userRepo.findOne.mockResolvedValue({
        ...baseUser,
        twoFactorEnabled: true,
        twoFactorSecret: encryptTotpSecret(secret),
        backupCodes,
      })

      const result = await service.completeTwoFactorLogin(baseUser.id, backupCode)

      expect(result.accessToken).toBe('access')
      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: baseUser.id,
          backupCodes: [
            expect.objectContaining({ hash: backupCodes[0].hash, usedAt: expect.any(String) }),
            backupCodes[1],
          ],
        })
      )
    })

    it('accepts a backup code once and rejects its reuse', async () => {
      useFakeClock()
      const secret = authenticator.generateSecret()
      const backupCode = 'ABCD1234EF'
      useStoredUser({
        ...enrolledUser(secret),
        backupCodes: [{ hash: await passwordHelper.hashPassword(backupCode), usedAt: null }],
      })

      await expect(service.completeTwoFactorLogin(baseUser.id, backupCode)).resolves.toEqual(
        expect.objectContaining({ accessToken: 'access' })
      )

      // Past the claim window, so only the persisted usedAt can reject the reuse.
      jest.advanceTimersByTime(61_000)
      await expect(service.completeTwoFactorLogin(baseUser.id, backupCode)).rejects.toThrow(
        BadRequestException
      )
    })

    it('lets only one of two concurrent requests redeem the same backup code', async () => {
      const secret = authenticator.generateSecret()
      const backupCode = 'ABCD1234EF'
      useStoredUser({
        ...enrolledUser(secret),
        backupCodes: [{ hash: await passwordHelper.hashPassword(backupCode), usedAt: null }],
      })

      const results = await Promise.allSettled([
        service.completeTwoFactorLogin(baseUser.id, backupCode),
        service.completeTwoFactorLogin(baseUser.id, backupCode),
      ])

      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    })

    it('rejects a backup code that was already used', async () => {
      const secret = authenticator.generateSecret()
      const backupCode = 'ABCD1234EF'
      const backupCodes = [
        { hash: await passwordHelper.hashPassword(backupCode), usedAt: new Date().toISOString() },
      ]
      userRepo.findOne.mockResolvedValue({
        ...baseUser,
        twoFactorEnabled: true,
        twoFactorSecret: encryptTotpSecret(secret),
        backupCodes,
      })

      await expect(service.completeTwoFactorLogin(baseUser.id, backupCode)).rejects.toThrow(
        BadRequestException
      )
      expect(userRepo.save).not.toHaveBeenCalled()
    })

    it('rejects a code that matches neither the TOTP secret nor any backup code', async () => {
      const secret = authenticator.generateSecret()
      userRepo.findOne.mockResolvedValue({
        ...baseUser,
        twoFactorEnabled: true,
        twoFactorSecret: encryptTotpSecret(secret),
        backupCodes: [{ hash: await passwordHelper.hashPassword('REALCODE01'), usedAt: null }],
      })

      await expect(service.completeTwoFactorLogin(baseUser.id, 'WRONGCODE1')).rejects.toThrow(
        BadRequestException
      )
    })

    it('rejects a blocked account even with a correct code', async () => {
      const secret = authenticator.generateSecret()
      userRepo.findOne.mockResolvedValue({
        ...baseUser,
        status: EnumUserStatus.BLOCKED,
        twoFactorEnabled: true,
        twoFactorSecret: encryptTotpSecret(secret),
      })

      await expect(
        service.completeTwoFactorLogin(baseUser.id, authenticator.generate(secret))
      ).rejects.toThrow(BadRequestException)
    })
  })

  describe('startTwoFactorEnrollment', () => {
    it('stores an encrypted secret and returns it with a QR code data URL', async () => {
      const result = await service.startTwoFactorEnrollment(baseUser.id, baseUser.username)

      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: baseUser.id, twoFactorSecret: expect.any(String) })
      )
      expect(result.secret).toEqual(expect.any(String))
      expect(result.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/)
    })
  })

  describe('confirmTwoFactorEnrollment', () => {
    it('activates 2FA and returns backup codes when the code is correct', async () => {
      const secret = authenticator.generateSecret()
      userRepo.findOne.mockResolvedValue({
        id: baseUser.id,
        twoFactorSecret: encryptTotpSecret(secret),
      })

      const result = await service.confirmTwoFactorEnrollment(
        baseUser.id,
        authenticator.generate(secret)
      )

      expect(result.backupCodes).toHaveLength(10)
      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: baseUser.id, twoFactorEnabled: true })
      )
    })

    it('rejects an incorrect code without activating 2FA', async () => {
      const secret = authenticator.generateSecret()
      userRepo.findOne.mockResolvedValue({
        id: baseUser.id,
        twoFactorSecret: encryptTotpSecret(secret),
      })

      await expect(service.confirmTwoFactorEnrollment(baseUser.id, '000000')).rejects.toThrow(
        BadRequestException
      )
      expect(userRepo.save).not.toHaveBeenCalled()
    })

    it('rejects confirmation when enrollment was never started', async () => {
      userRepo.findOne.mockResolvedValue({ id: baseUser.id, twoFactorSecret: null })

      await expect(service.confirmTwoFactorEnrollment(baseUser.id, '123456')).rejects.toThrow(
        BadRequestException
      )
    })
  })

  describe('disableTwoFactor', () => {
    it('clears 2FA state when the code is correct', async () => {
      const secret = authenticator.generateSecret()
      userRepo.findOne.mockResolvedValue({
        id: baseUser.id,
        twoFactorEnabled: true,
        twoFactorSecret: encryptTotpSecret(secret),
      })

      await service.disableTwoFactor(baseUser.id, authenticator.generate(secret))

      expect(userRepo.save).toHaveBeenCalledWith({
        id: baseUser.id,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        backupCodes: null,
      })
    })

    it('rejects an incorrect code without disabling 2FA', async () => {
      const secret = authenticator.generateSecret()
      userRepo.findOne.mockResolvedValue({
        id: baseUser.id,
        twoFactorEnabled: true,
        twoFactorSecret: encryptTotpSecret(secret),
      })

      await expect(service.disableTwoFactor(baseUser.id, '000000')).rejects.toThrow(
        BadRequestException
      )
      expect(userRepo.save).not.toHaveBeenCalled()
    })

    it('rejects when 2FA is not enabled', async () => {
      userRepo.findOne.mockResolvedValue({
        id: baseUser.id,
        twoFactorEnabled: false,
        twoFactorSecret: null,
      })

      await expect(service.disableTwoFactor(baseUser.id, '123456')).rejects.toThrow(
        BadRequestException
      )
    })

    it('revokes every remembered device for the user', async () => {
      const secret = authenticator.generateSecret()
      userRepo.findOne.mockResolvedValue(enrolledUser(secret))
      jest.spyOn(passwordHelper, 'comparePassword').mockResolvedValue(true)
      const deviceA = await service.completeTwoFactorLogin(
        baseUser.id,
        authenticator.generate(secret)
      )
      const deviceB = await service.completeTwoFactorLogin(
        baseUser.id,
        authenticator.generate(secret)
      )

      await service.disableTwoFactor(baseUser.id, authenticator.generate(secret))

      // Re-enrolled later: the old remembered devices must not skip the new challenge.
      for (const { rememberDeviceToken } of [deviceA, deviceB]) {
        await expect(
          service.login({ username: 'tester', password: 'correct' }, rememberDeviceToken)
        ).resolves.toEqual({ twoFactorRequired: true, pendingToken: 'pending-token' })
      }
    })

    it('is rate-limited the same way completeTwoFactorLogin is', async () => {
      const secret = authenticator.generateSecret()
      userRepo.findOne.mockResolvedValue({
        id: baseUser.id,
        twoFactorEnabled: true,
        twoFactorSecret: encryptTotpSecret(secret),
      })

      for (let i = 0; i < 5; i++) {
        await expect(service.disableTwoFactor(baseUser.id, '000000')).rejects.toThrow(
          BadRequestException
        )
      }

      await expect(
        service.disableTwoFactor(baseUser.id, authenticator.generate(secret))
      ).rejects.toThrow(BadRequestException)
      expect(userRepo.save).not.toHaveBeenCalled()
    })
  })
})
