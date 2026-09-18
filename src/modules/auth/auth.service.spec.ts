import { getRedisConnectionToken } from '@nestjs-modules/ioredis'
import { BadRequestException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { authenticator } from 'otplib'
import { EnumUserStatus, UserEntity, UserRole } from '../../db/entities/user.entity'
import { PermissionsEntity } from '../../db/entities/permissions'
import appConfig from '../../config/app-config'
import * as passwordHelper from '../../utils/password-helper'
import { encryptTotpSecret } from '../../utils/totp-crypto'
import { AuthenticationService } from '../authentication/authentication.service'
import { AuthService } from './auth.service'

describe('AuthService', () => {
  let service: AuthService
  let userRepo: { findOne: jest.Mock; save: jest.Mock }
  let redis: { get: jest.Mock; set: jest.Mock; incr: jest.Mock }
  let authenticationService: { signToken: jest.Mock }

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
    redis = { get: jest.fn(), set: jest.fn(), incr: jest.fn() }
    authenticationService = {
      signToken: jest.fn().mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' }),
    }

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
        { provide: getRepositoryToken(PermissionsEntity), useValue: {} },
        { provide: getRedisConnectionToken(), useValue: redis },
        { provide: AuthenticationService, useValue: authenticationService },
      ],
    }).compile()

    service = module.get(AuthService)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('logs in successfully with the correct password', async () => {
    userRepo.findOne.mockResolvedValue({ ...baseUser })
    jest.spyOn(passwordHelper, 'comparePassword').mockResolvedValue(true)

    const result = await service.login({ username: 'tester', password: 'correct' })

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
    redis.get.mockResolvedValue(null)

    await expect(service.login({ username: 'tester', password: 'wrong' })).rejects.toThrow(
      BadRequestException
    )
    expect(userRepo.save).not.toHaveBeenCalled()
  })

  it('blocks the account after the 5th wrong password attempt', async () => {
    userRepo.findOne.mockResolvedValue({ ...baseUser })
    jest.spyOn(passwordHelper, 'comparePassword').mockResolvedValue(false)
    redis.get.mockResolvedValueOnce('4').mockResolvedValueOnce('5')

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
})
