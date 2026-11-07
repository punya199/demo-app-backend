/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- rtk jest mock call inspection */
import { BadRequestException } from '@nestjs/common'
import { EnumFriendshipStatus } from '../../../db/entities/friendship.entity'
import { EnumMonsterStage } from '../../../db/entities/monster.entity'
import { RENTAL_FEE, SUPPORT_COOLDOWN_MS } from '../core/monster-rules'
import { monster, NOW } from '../core/monster-engine/test-fixtures'
import { SupportController } from './support.controller'
import { SupportService } from './support.service'
import { friendship, makeDataSource, makeEtm, ME, OTHER } from './social-test-helpers'

const mockLoadBonus = jest.fn()
const mockLoadCostumes = jest.fn()
const mockLoadLoadout = jest.fn()
jest.mock('../equipment/equipment.service', () => ({
  loadEquipmentBonus: (...a: unknown[]) => mockLoadBonus(...a),
}))
jest.mock('../equipment/costume.service', () => ({
  loadPublicCostumes: (...a: unknown[]) => mockLoadCostumes(...a),
}))
jest.mock('../passive/skill.service', () => ({
  loadArenaLoadout: (...a: unknown[]) => mockLoadLoadout(...a),
}))
jest.mock('../battle/battle-stats', () => ({
  toFighter: jest.fn(() => ({ emoji: 'E', name: 'N', nickname: 'Nick', stats: { hp: 1 } })),
}))
jest.mock('../arena/arena-fighter', () => ({
  toArenaFighter: jest.fn(() => ({ arena: true })),
}))

const unit = (overrides: Record<string, unknown> = {}) => ({
  id: 'unit-1',
  userId: OTHER,
  stage: EnumMonsterStage.ADULT,
  setAt: NOW,
  fighter: { emoji: 'E', name: 'N', stats: { hp: 1 } },
  ...overrides,
})

describe('SupportController', () => {
  it('delegates each route with the JWT user id', async () => {
    const service = {
      getMine: jest.fn().mockResolvedValue('mine'),
      setSupport: jest.fn().mockResolvedValue('set'),
      getRentable: jest.fn().mockResolvedValue('rent'),
    }
    const controller = new SupportController(service as unknown as SupportService)
    const user = { 'user-id': ME } as never
    await expect(controller.getMine(user)).resolves.toBe('mine')
    await expect(controller.setSupport(user)).resolves.toBe('set')
    await expect(controller.getRentable(user)).resolves.toBe('rent')
    expect(service.getMine).toHaveBeenCalledWith(ME)
    expect(service.setSupport).toHaveBeenCalledWith(ME)
    expect(service.getRentable).toHaveBeenCalledWith(ME)
  })
})

describe('SupportService', () => {
  const setup = () => {
    const etm = makeEtm()
    const dataSource = makeDataSource(etm)
    const monsters = { lockAndTickLatest: jest.fn() }
    const profiles = { ensureProfile: jest.fn(), getNames: jest.fn() }
    const service = new SupportService(dataSource as never, monsters as never, profiles as never)
    return { etm, monsters, profiles, service }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers().setSystemTime(NOW)
    mockLoadBonus.mockResolvedValue({})
    mockLoadLoadout.mockResolvedValue({})
  })
  afterEach(() => jest.useRealTimers())

  describe('getMine', () => {
    it('returns null without a unit', async () => {
      const { etm, service } = setup()
      etm.findOne.mockResolvedValue(null)
      await expect(service.getMine(ME)).resolves.toEqual({ support: null })
    })

    it('returns the unit view with defaults for optional fields', async () => {
      const { etm, service } = setup()
      etm.findOne.mockResolvedValue(unit())
      const { support } = await service.getMine(ME)
      expect(support).toMatchObject({
        supportId: 'unit-1',
        emoji: 'E',
        nickname: null,
        effects: null,
        readyAt: new Date(NOW.getTime() + SUPPORT_COOLDOWN_MS),
      })
    })

    it('keeps nickname and effects when present', async () => {
      const { etm, service } = setup()
      etm.findOne.mockResolvedValue(
        unit({ fighter: { emoji: 'E', name: 'N', nickname: 'Bo', stats: {}, effects: ['x'] } })
      )
      const { support } = await service.getMine(ME)
      expect(support).toMatchObject({ nickname: 'Bo', effects: ['x'] })
    })
  })

  describe('setSupport', () => {
    it.each([
      ['no monster', null],
      ['dead monster', monster({ diedAt: NOW })],
      ['too young', monster({ stage: EnumMonsterStage.EGG })],
    ])('rejects %s', async (_label, found) => {
      const { monsters, service } = setup()
      monsters.lockAndTickLatest.mockResolvedValue(found)
      await expect(service.setSupport(ME)).rejects.toThrow(
        new BadRequestException('Your monster is too young to be a support unit')
      )
    })

    it('rejects a change inside the cooldown', async () => {
      const { etm, monsters, service } = setup()
      monsters.lockAndTickLatest.mockResolvedValue(monster())
      etm.findOne.mockResolvedValue(unit({ setAt: new Date(NOW.getTime() - 1000) }))
      await expect(service.setSupport(ME)).rejects.toThrow(
        new BadRequestException('Support unit was changed recently')
      )
      expect(etm.query).not.toHaveBeenCalled()
    })

    it('stores a fresh unit when none exists', async () => {
      const { etm, monsters, profiles, service } = setup()
      const mon = { ...monster(), id: 'm1' }
      monsters.lockAndTickLatest.mockResolvedValue(mon)
      etm.findOne.mockResolvedValue(null)
      const result = await service.setSupport(ME)
      expect(profiles.ensureProfile).toHaveBeenCalledWith(ME, etm)
      const params = etm.query.mock.calls[0][1] as unknown[]
      expect(params[0]).toBe(ME)
      expect(params[2]).toBe(mon.stage)
      expect(params[3]).toEqual(NOW)
      expect(JSON.parse(params[4] as string)).toEqual({ arena: true })
      // second findOne is the getMine after the transaction
      expect(result).toEqual({ support: null })
    })

    it('replaces an old unit once the cooldown has passed', async () => {
      const { etm, monsters, service } = setup()
      monsters.lockAndTickLatest.mockResolvedValue(monster())
      etm.findOne.mockResolvedValue(unit({ setAt: new Date(NOW.getTime() - SUPPORT_COOLDOWN_MS) }))
      await service.setSupport(ME)
      expect(etm.query).toHaveBeenCalledTimes(1)
    })
  })

  describe('getRentable', () => {
    it('returns no units without friends', async () => {
      const { etm, service } = setup()
      etm.find.mockResolvedValue([])
      await expect(service.getRentable(ME)).resolves.toEqual({ fee: RENTAL_FEE, units: [] })
      expect(etm.createQueryBuilder).not.toHaveBeenCalled()
    })

    it('lists only friends units with names and costumes', async () => {
      const { etm, profiles, service } = setup()
      etm.find.mockResolvedValue([
        friendship({ status: EnumFriendshipStatus.ACCEPTED }),
        friendship({ userLow: 'a-friend', userHigh: ME }),
      ])
      etm.getMany.mockResolvedValue([
        unit({ userId: OTHER }),
        unit({ id: 'u2', userId: 'a-friend' }),
      ])
      profiles.getNames.mockResolvedValue(
        new Map([
          [OTHER, 'Pat'],
          ['a-friend', 'Sam'],
        ])
      )
      mockLoadCostumes.mockResolvedValue(new Map([[OTHER, { hat: 1 }]]))
      const out = await service.getRentable(ME)
      expect(etm.where).toHaveBeenCalledWith('unit.userId IN (:...friendIds)', {
        friendIds: [OTHER, 'a-friend'],
      })
      expect(out.fee).toBe(RENTAL_FEE)
      expect(out.units.map(u => [u.ownerName, u.costume])).toEqual([
        ['Pat', { hat: 1 }],
        ['Sam', null],
      ])
    })
  })
})
