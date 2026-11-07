import { PlayerProfileEntity } from '../../../db/entities/player-profile.entity'
import { defaultDisplayName } from './display-name'
import { ProfileService } from './profile.service'
import { fakeDataSource, fakeEtm, fakeInsertBuilder } from './core-test-helpers'

const profile = { userId: 'user-1', displayName: 'Tester', friendCode: 'ABCD1234' }

describe('ProfileService', () => {
  const etm = fakeEtm()
  const service = new ProfileService(fakeDataSource(etm) as never)

  beforeEach(() => {
    jest.resetAllMocks()
    etm.save.mockImplementation((_e: unknown, value: unknown) => Promise.resolve(value))
  })

  describe('ensureProfile', () => {
    it('returns an existing profile without inserting', async () => {
      etm.findOne.mockResolvedValue(profile)
      await expect(service.ensureProfile('user-1', etm)).resolves.toBe(profile)
      expect(etm.createQueryBuilder).not.toHaveBeenCalled()
    })

    it('uses the data source manager by default', async () => {
      const own = fakeEtm()
      own.findOne.mockResolvedValue(profile)
      const withDefault = new ProfileService(fakeDataSource(own) as never)
      await expect(withDefault.ensureProfile('user-1')).resolves.toBe(profile)
      expect(own.findOne).toHaveBeenCalledWith(PlayerProfileEntity, { where: { userId: 'user-1' } })
    })

    it('creates a profile with the default name and a friend code on first use', async () => {
      const builder = fakeInsertBuilder({})
      etm.createQueryBuilder.mockReturnValue(builder)
      etm.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(profile)
      await expect(service.ensureProfile('user-1', etm)).resolves.toBe(profile)
      expect(builder.into).toHaveBeenCalledWith(PlayerProfileEntity)
      const values = (builder.values.mock.calls as unknown[][])[0][0] as {
        userId: string
        displayName: string
        friendCode: string
      }
      expect(values.userId).toBe('user-1')
      expect(values.displayName).toBe(defaultDisplayName('user-1'))
      expect(typeof values.friendCode).toBe('string')
      expect(builder.orIgnore).toHaveBeenCalled()
    })

    it('retries when the insert lost a race or a code collision', async () => {
      const builder = fakeInsertBuilder({})
      etm.createQueryBuilder.mockReturnValue(builder)
      etm.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(profile)
      await expect(service.ensureProfile('user-1', etm)).resolves.toBe(profile)
      expect(builder.execute).toHaveBeenCalledTimes(2)
    })

    it('gives up after 8 attempts', async () => {
      const builder = fakeInsertBuilder({})
      etm.createQueryBuilder.mockReturnValue(builder)
      etm.findOne.mockResolvedValue(null)
      await expect(service.ensureProfile('user-1', etm)).rejects.toThrow(
        'Could not create a profile'
      )
      expect(builder.execute).toHaveBeenCalledTimes(8)
    })
  })

  describe('setDisplayName', () => {
    it('trims the name and saves the profile', async () => {
      etm.findOne.mockResolvedValue({ ...profile })
      const saved = await service.setDisplayName('user-1', '  Neo  ', etm)
      expect(saved.displayName).toBe('Neo')
      expect(etm.save).toHaveBeenCalledWith(
        PlayerProfileEntity,
        expect.objectContaining({ displayName: 'Neo' })
      )
    })

    it('uses the data source manager by default', async () => {
      const own = fakeEtm()
      own.findOne.mockResolvedValue({ ...profile })
      const withDefault = new ProfileService(fakeDataSource(own) as never)
      await withDefault.setDisplayName('user-1', 'Neo')
      expect(own.save).toHaveBeenCalled()
    })
  })

  describe('getNames', () => {
    it('returns an empty map without querying for no ids', async () => {
      const names = await service.getNames([], etm)
      expect(names.size).toBe(0)
      expect(etm.createQueryBuilder).not.toHaveBeenCalled()
    })

    it('maps stored names and falls back to the default tag', async () => {
      const query = {
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([profile]),
      }
      etm.createQueryBuilder.mockReturnValue(query)
      const names = await service.getNames(['user-1', 'user-2'], etm)
      expect(query.where).toHaveBeenCalledWith('profile.userId IN (:...userIds)', {
        userIds: ['user-1', 'user-2'],
      })
      expect(names.get('user-1')).toBe('Tester')
      expect(names.get('user-2')).toBe(defaultDisplayName('user-2'))
    })

    it('uses the data source manager by default', async () => {
      const own = fakeEtm()
      own.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })
      const withDefault = new ProfileService(fakeDataSource(own) as never)
      const names = await withDefault.getNames(['user-9'])
      expect(names.get('user-9')).toBe(defaultDisplayName('user-9'))
    })
  })
})
