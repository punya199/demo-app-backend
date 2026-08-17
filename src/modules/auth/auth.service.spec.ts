import { getRedisConnectionToken } from '@nestjs-modules/ioredis'
import { BadRequestException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { EnumUserStatus, UserEntity, UserRole } from '../../db/entities/user.entity'
import { PermissionsEntity } from '../../db/entities/permissions'
import * as passwordHelper from '../../utils/password-helper'
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
})
