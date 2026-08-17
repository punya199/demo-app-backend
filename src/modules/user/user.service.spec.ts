import { HttpException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { EnumUserStatus, UserEntity, UserRole } from '../../db/entities/user.entity'
import { PermissionsEntity } from '../../db/entities/permissions'
import * as passwordHelper from '../../utils/password-helper'
import { UserService } from './user.service'

describe('UserService', () => {
  let service: UserService
  let userRepo: {
    findOne: jest.Mock
    create: jest.Mock
    save: jest.Mock
    update: jest.Mock
    softDelete: jest.Mock
  }

  beforeEach(async () => {
    userRepo = {
      findOne: jest.fn(),
      create: jest.fn((entity: object) => entity),
      save: jest.fn((entity: object) => entity),
      update: jest.fn(),
      softDelete: jest.fn(),
    }

    const module = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
        { provide: getRepositoryToken(PermissionsEntity), useValue: {} },
      ],
    }).compile()

    service = module.get(UserService)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('registerUser', () => {
    it('rejects a username that already exists', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'existing' })

      await expect(
        service.registerUser({ username: 'taken', password: 'password123' })
      ).rejects.toThrow(HttpException)
      expect(userRepo.save).not.toHaveBeenCalled()
    })

    it('hashes the password before saving a new user', async () => {
      userRepo.findOne.mockResolvedValue(null)
      jest.spyOn(passwordHelper, 'hashPassword').mockResolvedValue('hashed-value')

      await service.registerUser({ username: 'newbie', password: 'plain-text' })

      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ password: 'hashed-value', role: UserRole.USER })
      )
    })
  })

  describe('changePassword', () => {
    it('throws when the user does not exist', async () => {
      userRepo.findOne.mockResolvedValue(null)

      await expect(
        service.changePassword('missing-user', {
          currentPassword: 'old',
          newPassword: 'new',
        })
      ).rejects.toThrow(HttpException)
    })

    it('rejects when the current password does not match', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'u1', password: 'stored-hash' })
      jest.spyOn(passwordHelper, 'comparePassword').mockResolvedValue(false)

      await expect(
        service.changePassword('u1', { currentPassword: 'wrong', newPassword: 'new' })
      ).rejects.toThrow(HttpException)
      expect(userRepo.update).not.toHaveBeenCalled()
    })

    it('hashes and saves the new password when the current one matches', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'u1', password: 'stored-hash' })
      jest.spyOn(passwordHelper, 'comparePassword').mockResolvedValue(true)
      jest.spyOn(passwordHelper, 'hashPassword').mockResolvedValue('new-hashed-value')

      const result = await service.changePassword('u1', {
        currentPassword: 'correct',
        newPassword: 'brand-new',
      })

      expect(userRepo.update).toHaveBeenCalledWith({ id: 'u1' }, { password: 'new-hashed-value' })
      expect(result).toEqual({ success: true })
    })
  })

  describe('deleteUser', () => {
    it('blocks deleting your own account', async () => {
      await expect(service.deleteUser('u1', 'u1')).rejects.toThrow(HttpException)
      expect(userRepo.softDelete).not.toHaveBeenCalled()
    })

    it('throws when the target user does not exist', async () => {
      userRepo.findOne.mockResolvedValue(null)

      await expect(service.deleteUser('admin', 'missing-user')).rejects.toThrow(HttpException)
    })

    it('soft-deletes another user', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'target' })

      const result = await service.deleteUser('admin', 'target')

      expect(userRepo.softDelete).toHaveBeenCalledWith('target')
      expect(result).toEqual({ success: true })
    })
  })

  describe('editRoleUser', () => {
    it('updates the role and status when the user exists', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'u1', username: 'tester', role: UserRole.USER })

      const result = await service.editRoleUser('u1', {
        role: UserRole.ADMIN,
        status: EnumUserStatus.ACTIVE,
      })

      expect(userRepo.update).toHaveBeenCalledWith(
        { id: 'u1' },
        { role: UserRole.ADMIN, status: EnumUserStatus.ACTIVE }
      )
      expect(result.user).toBeDefined()
    })
  })
})
