/* eslint-disable @typescript-eslint/no-unsafe-member-access -- rtk jest mock call inspection */
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { EnumFriendshipStatus } from '../../../db/entities/friendship.entity'
import {
  FRIEND_LIMIT,
  FRIEND_POINTS_GIFT,
  FRIEND_POINTS_GREET,
  FRIEND_REQUEST_LIMIT,
  GIFTS_PER_DAY,
} from '../core/monster-rules'
import { NOW } from '../core/monster-engine/test-fixtures'
import { EnumShopItemId } from '../equipment/shop-data'
import { FriendService } from './friend.service'
import { friendship, makeDataSource, makeEtm, ME, OTHER } from './social-test-helpers'

jest.mock('../equipment/costume.service', () => ({
  loadPublicCostumes: jest.fn().mockResolvedValue(new Map()),
}))

const setup = () => {
  const etm = makeEtm()
  const dataSource = makeDataSource(etm)
  const profiles = { ensureProfile: jest.fn(), getNames: jest.fn().mockResolvedValue(new Map()) }
  const inventory = {
    spend: jest.fn(),
    add: jest.fn(),
    getInventory: jest.fn().mockResolvedValue({ items: [] }),
  }
  const monsters = { getLatestAlive: jest.fn() }
  const service = new FriendService(
    dataSource as never,
    profiles as never,
    inventory as never,
    monsters as never
  )
  // list() runs at the end of several actions: keep it harmless
  etm.find.mockResolvedValue([])
  etm.count.mockResolvedValue(0)
  return { etm, profiles, inventory, service }
}

const CODE = 'ABCD2345'
const target = { userId: OTHER, friendCode: CODE }

describe('FriendService.request', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers().setSystemTime(NOW)
  })
  afterEach(() => jest.useRealTimers())

  const pending = (requestedBy: string) =>
    friendship({ status: EnumFriendshipStatus.PENDING, requestedBy })

  it('rejects a malformed code', async () => {
    const { service } = setup()
    await expect(service.request(ME, 'nope')).rejects.toThrow(
      new BadRequestException('Invalid friend code')
    )
  })

  it('rejects an unknown code', async () => {
    const { etm, service } = setup()
    etm.findOne.mockResolvedValue(null)
    await expect(service.request(ME, CODE)).rejects.toThrow(
      new NotFoundException('Friend code not found')
    )
  })

  it('rejects the own code', async () => {
    const { etm, service } = setup()
    etm.findOne.mockResolvedValue({ userId: ME })
    await expect(service.request(ME, CODE)).rejects.toThrow(
      new BadRequestException('You cannot add yourself')
    )
  })

  it('rejects when already friends', async () => {
    const { etm, service } = setup()
    etm.findOne.mockResolvedValueOnce(target).mockResolvedValueOnce(friendship())
    await expect(service.request(ME, CODE)).rejects.toThrow('Already friends')
  })

  it('rejects a repeated request', async () => {
    const { etm, service } = setup()
    etm.findOne.mockResolvedValueOnce(target).mockResolvedValueOnce(pending(ME))
    await expect(service.request(ME, CODE)).rejects.toThrow('Friend request already sent')
  })

  it('accepts their earlier request and normalizes the typed code', async () => {
    const { etm, service } = setup()
    etm.findOne.mockResolvedValueOnce(target).mockResolvedValueOnce(pending(OTHER))
    await service.request(ME, 'abcd-2345')
    expect(etm.findOne.mock.calls[0][1]).toEqual({ where: { friendCode: CODE } })
    expect(etm.update).toHaveBeenCalledWith(
      expect.anything(),
      { id: 'rel-1' },
      { status: EnumFriendshipStatus.ACCEPTED }
    )
  })

  it('refuses to accept their request when the friend list is full', async () => {
    const { etm, service } = setup()
    etm.findOne.mockResolvedValueOnce(target).mockResolvedValueOnce(pending(OTHER))
    etm.find.mockResolvedValue(Array.from({ length: FRIEND_LIMIT }, () => friendship()))
    await expect(service.request(ME, CODE)).rejects.toThrow('Friend list is full')
    expect(etm.update).not.toHaveBeenCalled()
  })

  it('counts own pending requests as slots when sending a new one', async () => {
    const { etm, service } = setup()
    etm.findOne.mockResolvedValueOnce(target).mockResolvedValueOnce(null)
    etm.find.mockResolvedValue([
      ...Array.from({ length: FRIEND_LIMIT - 1 }, () => friendship()),
      pending(ME),
    ])
    await expect(service.request(ME, CODE)).rejects.toThrow('Friend list is full')
  })

  it('ignores incoming pending requests when counting slots', async () => {
    const { etm, service } = setup()
    etm.findOne.mockResolvedValueOnce(target).mockResolvedValueOnce(null)
    etm.find
      .mockResolvedValueOnce(Array.from({ length: FRIEND_LIMIT }, () => pending(OTHER)))
      .mockResolvedValue([])
    etm.count.mockResolvedValue(0)
    etm.execute.mockResolvedValue({ raw: [{ id: 'new' }] })
    await service.request(ME, CODE)
    expect(etm.execute).toHaveBeenCalledTimes(1)
  })

  it('rejects when the target has too many pending requests', async () => {
    const { etm, service } = setup()
    etm.findOne.mockResolvedValueOnce(target).mockResolvedValueOnce(null)
    etm.count.mockResolvedValue(FRIEND_REQUEST_LIMIT)
    await expect(service.request(ME, CODE)).rejects.toThrow(
      'That player has too many pending requests'
    )
  })

  it('inserts an ordered pending row', async () => {
    const { etm, service } = setup()
    etm.findOne.mockResolvedValueOnce(target).mockResolvedValueOnce(null)
    etm.execute.mockResolvedValue({ raw: [{ id: 'new' }] })
    await service.request(ME, CODE)
    expect(etm.values).toHaveBeenCalledWith({
      userLow: ME,
      userHigh: OTHER,
      requestedBy: ME,
      status: EnumFriendshipStatus.PENDING,
      points: 0,
    })
  })

  it('meets the other side after losing an insert race', async () => {
    const { etm, service } = setup()
    etm.findOne
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(pending(OTHER))
    etm.execute.mockResolvedValue({ raw: [] })
    await service.request(ME, CODE)
    expect(etm.update).toHaveBeenCalledTimes(1)
  })

  it('gives up quietly after two lost races', async () => {
    const { etm, service } = setup()
    etm.findOne.mockResolvedValueOnce(target).mockResolvedValue(null)
    etm.execute.mockResolvedValue({})
    await expect(service.request(ME, CODE)).resolves.toBeDefined()
    expect(etm.execute).toHaveBeenCalledTimes(2)
  })
})

describe('FriendService.respond / remove', () => {
  beforeEach(() => jest.clearAllMocks())

  it.each([
    ['missing', null],
    ['own request', friendship({ status: EnumFriendshipStatus.PENDING, requestedBy: ME })],
  ])('respond rejects %s', async (_l, row) => {
    const { etm, service } = setup()
    etm.findOne.mockResolvedValue(row)
    await expect(service.respond(ME, 'rel-1', true)).rejects.toThrow(
      new NotFoundException('Friend request not found')
    )
  })

  const incoming = friendship({ status: EnumFriendshipStatus.PENDING, requestedBy: OTHER })

  it('declines by soft deleting the row', async () => {
    const { etm, service } = setup()
    etm.findOne.mockResolvedValue(incoming)
    await service.respond(ME, 'rel-1', false)
    expect(etm.softDelete).toHaveBeenCalledWith(expect.anything(), { id: 'rel-1' })
    expect(etm.update).not.toHaveBeenCalled()
  })

  it('refuses to accept when the friend list is full', async () => {
    const { etm, service } = setup()
    etm.findOne.mockResolvedValue(incoming)
    etm.count.mockResolvedValue(FRIEND_LIMIT)
    await expect(service.respond(ME, 'rel-1', true)).rejects.toThrow('Friend list is full')
  })

  it('accepts a request', async () => {
    const { etm, service } = setup()
    etm.findOne.mockResolvedValue(incoming)
    await service.respond(ME, 'rel-1', true)
    expect(etm.update).toHaveBeenCalledWith(
      expect.anything(),
      { id: 'rel-1' },
      { status: EnumFriendshipStatus.ACCEPTED }
    )
  })

  it('remove rejects an unknown relation', async () => {
    const { etm, service } = setup()
    etm.findOne.mockResolvedValue(null)
    await expect(service.remove(ME, 'rel-1')).rejects.toThrow(
      new NotFoundException('Friend not found')
    )
  })

  it('remove soft deletes the relation', async () => {
    const { etm, service } = setup()
    etm.findOne.mockResolvedValue(friendship())
    await service.remove(ME, 'rel-1')
    expect(etm.softDelete).toHaveBeenCalledWith(expect.anything(), { id: 'rel-1' })
  })
})

describe('FriendService.greet / gift', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers().setSystemTime(NOW)
  })
  afterEach(() => jest.useRealTimers())

  it('greet rejects a non-friend, locking the row lookup', async () => {
    const { etm, service } = setup()
    etm.findOne.mockResolvedValue(null)
    await expect(service.greet(ME, 'rel-1')).rejects.toThrow('Friend not found')
    expect(etm.findOne.mock.calls[0][1]).toMatchObject({ lock: { mode: 'pessimistic_write' } })
  })

  it('greet rejects a second greeting today', async () => {
    const { etm, service } = setup()
    etm.findOne.mockResolvedValue(friendship())
    etm.count.mockResolvedValue(1)
    await expect(service.greet(ME, 'rel-1')).rejects.toThrow(
      'You already greeted this friend today'
    )
    expect(etm.save).not.toHaveBeenCalled()
  })

  it('greet records the interaction and adds points', async () => {
    const { etm, service } = setup()
    etm.findOne.mockResolvedValue(friendship({ points: 2 }))
    etm.count.mockResolvedValue(0)
    await expect(service.greet(ME, 'rel-1')).resolves.toEqual({ points: 2 + FRIEND_POINTS_GREET })
    expect(etm.save).toHaveBeenCalledTimes(2)
  })

  it('gift rejects at the daily limit', async () => {
    const { etm, service } = setup()
    etm.findOne.mockResolvedValue(friendship())
    etm.count.mockResolvedValue(GIFTS_PER_DAY)
    await expect(service.gift(ME, 'rel-1', EnumShopItemId.PROTEIN)).rejects.toThrow(
      'Daily gift limit reached'
    )
    expect(etm.query).toHaveBeenCalledTimes(1)
  })

  it('gift rejects when the sender does not own the item', async () => {
    const { etm, inventory, service } = setup()
    etm.findOne.mockResolvedValue(friendship())
    etm.count.mockResolvedValue(0)
    inventory.spend.mockResolvedValue(false)
    await expect(service.gift(ME, 'rel-1', EnumShopItemId.PROTEIN)).rejects.toThrow(
      'You do not have this item'
    )
    expect(inventory.add).not.toHaveBeenCalled()
  })

  it('gift moves the item to the friend and awards points', async () => {
    const { etm, inventory, service } = setup()
    etm.findOne.mockResolvedValue(friendship({ userLow: OTHER, userHigh: ME, points: 1 }))
    etm.count.mockResolvedValue(1)
    inventory.spend.mockResolvedValue(true)
    const out = await service.gift(ME, 'rel-1', EnumShopItemId.PROTEIN)
    expect(inventory.spend).toHaveBeenCalledWith(ME, EnumShopItemId.PROTEIN, 1, etm)
    expect(inventory.add).toHaveBeenCalledWith(OTHER, EnumShopItemId.PROTEIN, etm)
    expect(out).toEqual({
      points: 1 + FRIEND_POINTS_GIFT,
      giftsLeft: GIFTS_PER_DAY - 2,
      items: [],
    })
  })
})
