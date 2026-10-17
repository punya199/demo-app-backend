import { BadRequestException } from '@nestjs/common'
import { AttachmentEntity } from '../../db/entities/attachment.entity'
import { HouseRentDetailEntity } from '../../db/entities/house-rent-detail.entity'
import { HouseRentMemberEntity } from '../../db/entities/house-rent-member.entity'
import { HouseRentService } from './house-rent.service'

// Query builder stub: every chained call returns itself, terminals resolve to `result`.
const qb = (result: unknown) => {
  const chain: any = new Proxy(
    {},
    {
      get: (_t, name: string) =>
        name === 'getMany' || name === 'getOne' ? () => Promise.resolve(result) : () => chain,
    }
  )
  return chain
}

const repo = (over: Record<string, unknown> = {}) => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  softDelete: jest.fn(),
  createQueryBuilder: jest.fn(),
  ...over,
})

const makeService = (
  houseRentRepo = repo(),
  attachmentRepo = repo(),
  userRepo = repo(),
  memberRepo = repo()
) =>
  new HouseRentService(
    houseRentRepo as any,
    attachmentRepo as any,
    userRepo as any,
    memberRepo as any
  )

const electricity = { totalPrice: 1000, unit: 100 }

describe('HouseRentService.createHouseRent', () => {
  const makeEtm = (existing: unknown = null) => ({
    findOne: jest.fn().mockResolvedValue(existing),
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
    softDelete: jest.fn(),
    save: jest.fn((_e: unknown, rows: any) =>
      Promise.resolve(Array.isArray(rows) ? rows : { ...rows, id: 'h' })
    ),
  })
  const service = makeService()

  it('rejects a duplicate name', async () => {
    await expect(
      service.createHouseRent({ name: 'dup' } as any, makeEtm({ id: 'x' }) as any)
    ).rejects.toThrow(BadRequestException)
  })

  it('saves details and members, then links attachments', async () => {
    const etm = makeEtm()
    const params = {
      name: 'n',
      rents: [{ month: new Date(), houseRentPrice: 1, waterPrice: 1, electricity }],
      members: [{ userId: 'u', airConditionUnit: 1, electricityUnit: {} }],
      attachmentIds: ['a'],
    } as any
    const result = await service.createHouseRent(params, etm as any)
    expect(result.houseRent).toMatchObject({ id: 'h' })
    expect(etm.save).toHaveBeenCalledWith(HouseRentMemberEntity, expect.any(Array))
    expect(etm.update).toHaveBeenCalledWith(AttachmentEntity, expect.anything(), {
      attachableId: 'h',
      attachableType: 'house_rent',
    })
  })

  it('soft-deletes details and members when none are submitted', async () => {
    const etm = makeEtm()
    await service.createHouseRent({ name: 'n' } as any, etm as any)
    expect(etm.softDelete).toHaveBeenCalledWith(HouseRentDetailEntity, { houseRentId: 'h' })
    expect(etm.softDelete).toHaveBeenCalledWith(HouseRentMemberEntity, { houseRentId: 'h' })
    expect(etm.softDelete).toHaveBeenCalledWith(AttachmentEntity, {
      attachableId: 'h',
      attachableType: 'house_rent',
    })
  })
})

describe('HouseRentService.updateHouseRent (empty payload)', () => {
  it('soft-deletes details (with their attachments) and members', async () => {
    const etm = {
      update: jest.fn(),
      find: jest.fn().mockResolvedValue([{ id: 'd1' }]),
      softDelete: jest.fn(),
      save: jest.fn(),
    }
    await makeService().updateHouseRent('h', { name: 'n' } as any, etm as any)
    expect(etm.softDelete).toHaveBeenCalledWith(HouseRentDetailEntity, { houseRentId: 'h' })
    expect(etm.softDelete).toHaveBeenCalledWith(HouseRentMemberEntity, { houseRentId: 'h' })
    expect(etm.softDelete).toHaveBeenCalledWith(
      AttachmentEntity,
      expect.objectContaining({ attachableType: 'house_rent_detail' })
    )
  })
})

describe('HouseRentService.getHouseRent', () => {
  it('groups attachments by house rent and by detail', async () => {
    const houseRentRepo = repo({
      findOne: jest.fn().mockResolvedValue({ id: 'h', rents: [{ id: 'd1' }, { id: 'd2' }] }),
    })
    const attachmentRepo = repo({
      find: jest.fn().mockResolvedValue([
        { id: 'a1', attachableId: 'h', attachableType: 'house_rent' },
        { id: 'a2', attachableId: 'd1', attachableType: 'house_rent_detail' },
      ]),
    })
    const { houseRent } = await makeService(houseRentRepo, attachmentRepo).getHouseRent('h')
    expect(houseRent.attachments.map((a: any) => a.id)).toEqual(['a1'])
    expect(houseRent.rents?.map((r: any) => r.attachments.length)).toEqual([1, 0])
  })

  it('only queries house-level attachments when there are no details', async () => {
    const houseRentRepo = repo({ findOne: jest.fn().mockResolvedValue({ id: 'h' }) })
    const attachmentRepo = repo()
    await makeService(houseRentRepo, attachmentRepo).getHouseRent('h')
    expect(attachmentRepo.find.mock.calls[0][0].where).toHaveLength(1)
  })

  it('handles a missing house rent', async () => {
    const { houseRent } = await makeService(
      repo({ findOne: jest.fn().mockResolvedValue(null) })
    ).getHouseRent('missing')
    expect(houseRent.attachments).toEqual([])
  })
})

describe('HouseRentService simple queries', () => {
  it('getHouseRents lists house rents', async () => {
    const houseRentRepo = repo({ find: jest.fn().mockResolvedValue([{ id: 'h' }]) })
    expect(await makeService(houseRentRepo).getHouseRents()).toEqual({ houseRents: [{ id: 'h' }] })
  })

  it('getHouseRentUsers lists member users', async () => {
    const userRepo = repo({ createQueryBuilder: jest.fn(() => qb([{ id: 'u' }])) })
    expect(await makeService(repo(), repo(), userRepo).getHouseRentUsers()).toEqual({
      users: [{ id: 'u' }],
    })
  })

  it('deleteHouseRent soft-deletes', async () => {
    const houseRentRepo = repo()
    await makeService(houseRentRepo).deleteHouseRent('h')
    expect(houseRentRepo.softDelete).toHaveBeenCalledWith('h')
  })
})

describe('HouseRentService.getHouseRentUser', () => {
  it('builds per-month data for each membership, skipping unknown houses', async () => {
    const user = { id: 'u', username: 'alice' }
    const member = {
      houseRentId: 'h',
      airConditionUnit: 2,
      electricityUnit: { diff: 10, prev: 1, current: 11 },
    }
    const houseRent = {
      id: 'h',
      name: 'house',
      airCondition: { pricePerUnit: 5 },
      members: [member, member],
      rents: [{ month: '2026-01-01', waterPrice: 100, electricity }],
    }
    const houseRentRepo = repo({ createQueryBuilder: jest.fn(() => qb([houseRent])) })
    const userRepo = repo({ createQueryBuilder: jest.fn(() => qb(user)) })
    const memberRepo = repo({
      createQueryBuilder: jest.fn(() => qb([member, { ...member, houseRentId: 'other' }])),
    })

    const { data, user: result } = await makeService(
      houseRentRepo,
      repo(),
      userRepo,
      memberRepo
    ).getHouseRentUser('u')

    expect(result).toBe(user)
    expect(data).toEqual([
      {
        group: 'house',
        title: '2026-01-01',
        airConditionPrice: 10,
        waterPrice: 50,
        electricityRate: 10,
        individualElectricityPrice: 100,
        electricityUnit: { diff: 10, prev: 1, current: 11 },
      },
    ])
  })

  it('handles a house rent without members or rents', async () => {
    const member = { houseRentId: 'h', electricityUnit: {} }
    const houseRentRepo = repo({
      createQueryBuilder: jest.fn(() => qb([{ id: 'h', name: 'house' }])),
    })
    const memberRepo = repo({ createQueryBuilder: jest.fn(() => qb([member])) })
    const userRepo = repo({ createQueryBuilder: jest.fn(() => qb(null)) })
    const { data } = await makeService(
      houseRentRepo,
      repo(),
      userRepo,
      memberRepo
    ).getHouseRentUser('u')
    expect(data).toEqual([])
  })
})

describe('HouseRentService.getHouseRentOverview', () => {
  const member = (username: string, diff: number) => ({
    airConditionUnit: 1,
    electricityUnit: { diff, prev: 0, current: diff },
    user: { username },
  })
  const base = {
    name: 'house',
    baseHouseRent: 3000,
    paymentFee: 30,
    airCondition: { pricePerUnit: 5 },
    internet: { pricePerMonth: 600 },
  }

  it('computes shares per rent month and per member', async () => {
    const houseRent = {
      ...base,
      members: [member('a', 60), member('b', 20)],
      rents: [{ month: '2026-01-01', waterPrice: 100, electricity }],
    }
    const houseRentRepo = repo({ createQueryBuilder: jest.fn(() => qb([houseRent])) })
    const { data } = (await makeService(houseRentRepo).getHouseRentOverview()) as any

    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({
      group: 'house',
      title: '2026-01-01',
      electricity: {
        totalPrice: 1000,
        unit: 100,
        pricePerUnit: 10,
        shareUnit: 20,
        sharePrice: 200,
      },
    })
    expect(Object.keys(data[0].members)).toEqual(['a', 'b'])
    expect(data[0].members.a).toMatchObject({
      username: 'a',
      waterPrice: 50,
      baseHouseRent: 1500,
      individualElectricityPrice: 600,
    })
  })

  it('skips house rents without rents or members', async () => {
    const houseRentRepo = repo({
      createQueryBuilder: jest.fn(() => qb([{ ...base }, { ...base, rents: [], members: [] }])),
    })
    const { data } = await makeService(houseRentRepo).getHouseRentOverview()
    expect(data).toEqual([])
  })

  it('handles a rent month for a house without members', async () => {
    const houseRent = { ...base, rents: [{ month: 'm', waterPrice: 0, electricity }] }
    const houseRentRepo = repo({ createQueryBuilder: jest.fn(() => qb([houseRent])) })
    const { data } = (await makeService(houseRentRepo).getHouseRentOverview()) as any
    expect(data[0].members).toBeUndefined()
  })
})
