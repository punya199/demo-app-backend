/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- rtk jest mock call inspection */
import { NotFoundException } from '@nestjs/common'
import { EnumFriendshipStatus } from '../../../db/entities/friendship.entity'
import { EnumMonsterStage } from '../../../db/entities/monster.entity'
import { FRIEND_LIMIT, GIFTS_PER_DAY } from '../core/monster-rules'
import { NOW } from '../core/monster-engine/test-fixtures'
import { FriendController } from './friend.controller'
import { FriendService } from './friend.service'
import { friendship, makeDataSource, makeEtm, ME, OTHER, THIRD } from './social-test-helpers'

const mockLoadCostumes = jest.fn()
const mockLoadBonus = jest.fn()
jest.mock('../equipment/costume.service', () => ({
  loadPublicCostumes: (...a: unknown[]) => mockLoadCostumes(...a),
}))
jest.mock('../equipment/equipment.service', () => ({
  loadEquipmentBonus: (...a: unknown[]) => mockLoadBonus(...a),
}))
jest.mock('../battle/battle-stats', () => ({
  toFighter: jest.fn(() => ({ stats: { hp: 7 } })),
}))

const setup = () => {
  const etm = makeEtm()
  const dataSource = makeDataSource(etm)
  const profiles = { ensureProfile: jest.fn(), getNames: jest.fn() }
  const inventory = { spend: jest.fn(), add: jest.fn(), getInventory: jest.fn() }
  const monsters = { getLatestAlive: jest.fn() }
  const service = new FriendService(
    dataSource as never,
    profiles as never,
    inventory as never,
    monsters as never
  )
  return { etm, profiles, inventory, monsters, service }
}

describe('FriendController', () => {
  it('delegates each route with the JWT user id', async () => {
    const service = {
      list: jest.fn().mockResolvedValue('list'),
      request: jest.fn().mockResolvedValue('request'),
      respond: jest.fn().mockResolvedValue('respond'),
      remove: jest.fn().mockResolvedValue('remove'),
      visit: jest.fn().mockResolvedValue('visit'),
      greet: jest.fn().mockResolvedValue('greet'),
      gift: jest.fn().mockResolvedValue('gift'),
    }
    const controller = new FriendController(service as unknown as FriendService)
    const user = { 'user-id': ME } as never
    expect(await controller.list(user)).toBe('list')
    expect(await controller.request({ friendCode: 'ABCD2345' } as never, user)).toBe('request')
    expect(await controller.respond({ relationId: 'r', accept: true } as never, user)).toBe(
      'respond'
    )
    expect(await controller.remove('r', user)).toBe('remove')
    expect(await controller.visit('r', user)).toBe('visit')
    expect(await controller.greet('r', user)).toBe('greet')
    expect(await controller.gift('r', { itemId: 'protein' } as never, user)).toBe('gift')
    expect(service.request).toHaveBeenCalledWith(ME, 'ABCD2345')
    expect(service.respond).toHaveBeenCalledWith(ME, 'r', true)
    expect(service.remove).toHaveBeenCalledWith(ME, 'r')
    expect(service.gift).toHaveBeenCalledWith(ME, 'r', 'protein')
  })
})

describe('FriendService.list', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers().setSystemTime(NOW)
    mockLoadCostumes.mockResolvedValue(new Map())
    mockLoadBonus.mockResolvedValue({})
  })
  afterEach(() => jest.useRealTimers())

  it('returns empty lists and skips lookups when there are no relations', async () => {
    const { etm, profiles, service } = setup()
    etm.find.mockResolvedValue([])
    etm.count.mockResolvedValue(0)
    profiles.getNames.mockResolvedValue(new Map())
    const out = await service.list(ME)
    expect(out).toEqual({
      friendLimit: FRIEND_LIMIT,
      giftsLeft: GIFTS_PER_DAY,
      friends: [],
      incoming: [],
      outgoing: [],
    })
    // only the relations query ran: no support-unit or greeting queries
    expect(etm.find).toHaveBeenCalledTimes(1)
  })

  it('splits friends, incoming and outgoing and annotates friends', async () => {
    const { etm, profiles, monsters, service } = setup()
    const accepted = friendship({ id: 'r-acc', points: 4 })
    const accepted2 = friendship({ id: 'r-acc2', userLow: THIRD, userHigh: ME, points: 1 })
    const incoming = friendship({
      id: 'r-in',
      userLow: 'x-low',
      userHigh: ME,
      requestedBy: 'x-low',
      status: EnumFriendshipStatus.PENDING,
    })
    const outgoing = friendship({
      id: 'r-out',
      userLow: ME,
      userHigh: 'y-high',
      requestedBy: ME,
      status: EnumFriendshipStatus.PENDING,
    })
    etm.find
      .mockResolvedValueOnce([accepted, accepted2, incoming, outgoing])
      .mockResolvedValueOnce([{ userId: OTHER }]) // support units
      .mockResolvedValueOnce([{ friendshipId: 'r-acc2' }]) // greeted today
    etm.count.mockResolvedValue(2)
    profiles.getNames.mockResolvedValue(
      new Map([
        [OTHER, 'Pat'],
        [THIRD, 'Sam'],
        ['x-low', 'In'],
        ['y-high', 'Out'],
      ])
    )
    mockLoadCostumes.mockResolvedValue(new Map([[OTHER, { hat: 1 }]]))
    monsters.getLatestAlive.mockImplementation(async (id: string) =>
      id === OTHER ? { speciesId: 'flame_adultGood', stage: EnumMonsterStage.ADULT } : null
    )

    const out = await service.list(ME)

    expect(out.giftsLeft).toBe(GIFTS_PER_DAY - 2)
    expect(out.friends).toEqual([
      {
        relationId: 'r-acc',
        displayName: 'Pat',
        monster: {
          emoji: expect.any(String),
          sprite: 'gecko',
          stage: EnumMonsterStage.ADULT,
          costume: { hat: 1 },
        },
        points: 4,
        hasSupport: true,
        canGreet: true,
      },
      {
        relationId: 'r-acc2',
        displayName: 'Sam',
        monster: null,
        points: 1,
        hasSupport: false,
        canGreet: false,
      },
    ])
    expect(out.incoming).toEqual([{ relationId: 'r-in', displayName: 'In' }])
    expect(out.outgoing).toEqual([{ relationId: 'r-out', displayName: 'Out' }])
  })

  it('shows a friend monster without costume as costume null', async () => {
    const { etm, profiles, monsters, service } = setup()
    etm.find
      .mockResolvedValueOnce([friendship()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    etm.count.mockResolvedValue(5)
    profiles.getNames.mockResolvedValue(new Map([[OTHER, 'Pat']]))
    monsters.getLatestAlive.mockResolvedValue({
      speciesId: 'flame_adultGood',
      stage: EnumMonsterStage.ADULT,
    })
    const out = await service.list(ME)
    expect(out.giftsLeft).toBe(0)
    expect(out.friends[0].monster?.costume).toBeNull()
  })
})

describe('FriendService.visit', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockLoadCostumes.mockResolvedValue(new Map())
    mockLoadBonus.mockResolvedValue({})
  })

  it('throws when the relation is not an accepted friendship of the user', async () => {
    const { etm, service } = setup()
    etm.findOne.mockResolvedValue(null)
    await expect(service.visit(ME, 'rel-x')).rejects.toThrow(
      new NotFoundException('Friend not found')
    )
  })

  it('returns a null monster when the friend has none', async () => {
    const { etm, profiles, monsters, service } = setup()
    etm.findOne.mockResolvedValue(friendship({ points: 3 }))
    profiles.getNames.mockResolvedValue(new Map([[OTHER, 'Pat']]))
    monsters.getLatestAlive.mockResolvedValue(null)
    await expect(service.visit(ME, 'rel-1')).resolves.toEqual({
      displayName: 'Pat',
      points: 3,
      monster: null,
    })
  })

  it('returns the monster profile with computed stats', async () => {
    const { etm, profiles, monsters, service } = setup()
    // the user is the high side here, so the friend is userLow
    etm.findOne.mockResolvedValue(friendship({ userLow: OTHER, userHigh: ME }))
    profiles.getNames.mockResolvedValue(new Map([[OTHER, 'Pat']]))
    mockLoadCostumes.mockResolvedValue(new Map([[OTHER, { hat: 2 }]]))
    monsters.getLatestAlive.mockResolvedValue({
      id: 'm1',
      speciesId: 'flame_adultGood',
      nickname: 'Bo',
      stage: EnumMonsterStage.ADULT,
      ageMinutes: 90,
      isSick: true,
      expeditionAreaId: 'area-1',
      wins: 2,
      losses: 1,
    })
    const out = await service.visit(ME, 'rel-1')
    expect(mockLoadBonus).toHaveBeenCalledWith(OTHER, 'm1', expect.anything())
    expect(out.monster).toMatchObject({
      nickname: 'Bo',
      costume: { hat: 2 },
      ageMinutes: 90,
      isSick: true,
      isExploring: true,
      wins: 2,
      losses: 1,
      stats: { hp: 7 },
    })
  })

  it('reports not exploring and no costume by default', async () => {
    const { etm, profiles, monsters, service } = setup()
    etm.findOne.mockResolvedValue(friendship())
    profiles.getNames.mockResolvedValue(new Map([[OTHER, 'Pat']]))
    monsters.getLatestAlive.mockResolvedValue({
      id: 'm1',
      speciesId: 'flame_adultGood',
      expeditionAreaId: null,
    })
    const out = await service.visit(ME, 'rel-1')
    expect(out.monster).toMatchObject({ isExploring: false, costume: null })
  })
})
