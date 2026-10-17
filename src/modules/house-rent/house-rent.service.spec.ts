import { AttachmentEntity } from '../../db/entities/attachment.entity'
import { In, Not } from 'typeorm'
import { HouseRentDetailEntity } from '../../db/entities/house-rent-detail.entity'
import { HouseRentMemberEntity } from '../../db/entities/house-rent-member.entity'
import { HouseRentService } from './house-rent.service'

describe('HouseRentService.updateHouseRent', () => {
  const houseRentId = 'house-1'
  const service = new HouseRentService(null as any, null as any, null as any, null as any)

  const run = (rents: any[], members: any[]) => {
    const calls: string[] = []
    const etm = {
      update: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn((entity: { name: string }, rows: unknown[]) => {
        calls.push(`save:${entity.name}`)
        return Promise.resolve(rows)
      }),
      softDelete: jest.fn((entity: { name: string }) => {
        calls.push(`softDelete:${entity.name}`)
        return Promise.resolve()
      }),
    }
    const params = { name: 'n', rents, members, attachmentIds: [] } as any
    return service.updateHouseRent(houseRentId, params, etm as any).then(() => ({ etm, calls }))
  }

  const rent = (id?: string) => ({ id, month: new Date('2026-01-01') })
  const member = (id?: string) => ({ id, userId: 'u' })

  it.each([
    ['rents', HouseRentDetailEntity],
    ['members', HouseRentMemberEntity],
  ] as const)('soft-deletes %s missing from the list, before saving', async (key, Entity) => {
    const { etm, calls } = await run(
      key === 'rents' ? [rent('a'), rent()] : [rent('x')],
      key === 'members' ? [member('a'), member()] : [member('x')]
    )
    expect(etm.softDelete).toHaveBeenCalledWith(Entity, { houseRentId, id: Not(In(['a'])) })
    expect(calls.indexOf(`softDelete:${Entity.name}`)).toBeLessThan(
      calls.indexOf(`save:${Entity.name}`)
    )
  })

  it('soft-deletes all existing rows when every submitted row is new', async () => {
    const { etm } = await run([rent()], [member()])
    expect(etm.softDelete).toHaveBeenCalledWith(HouseRentDetailEntity, { houseRentId })
    expect(etm.softDelete).toHaveBeenCalledWith(HouseRentMemberEntity, { houseRentId })
  })
})

describe('HouseRentService detail attachments', () => {
  const service = new HouseRentService(null as any, null as any, null as any, null as any)
  const detailType = 'house_rent_detail'

  const makeEtm = (taken: any[] = [], removed: any[] = []) => ({
    update: jest.fn(),
    find: jest.fn((entity: { name: string }) =>
      Promise.resolve(entity === AttachmentEntity ? taken : removed)
    ),
    save: jest.fn((_entity: unknown, rows: any) =>
      Promise.resolve(
        Array.isArray(rows)
          ? rows.map((row, i) => ({ ...row, id: row.id ?? `new-${i}` }))
          : { ...rows, id: 'h' }
      )
    ),
    softDelete: jest.fn(),
  })
  const rent = (attachmentIds?: string[], id?: string) => ({
    id,
    month: new Date('2026-01-01'),
    attachmentIds,
  })

  it('links attachments to the saved detail on create, matched by position', async () => {
    const etm = makeEtm()
    await service.createHouseRent(
      { name: 'n', rents: [rent(['a']), rent(['b'])], members: [], attachmentIds: [] } as any,
      { ...etm, findOne: jest.fn(), save: etm.save } as any
    )
    expect(etm.update).toHaveBeenCalledWith(
      AttachmentEntity,
      { id: In(['b']) },
      { attachableId: 'new-1', attachableType: detailType }
    )
  })

  it('rejects an attachment already linked to another record', async () => {
    const etm = makeEtm([{ id: 'a', attachableId: 'other', attachableType: detailType }])
    await expect(
      service.updateHouseRent(
        'h',
        { name: 'n', rents: [rent(['a'], 'd1')], members: [], attachmentIds: [] } as any,
        etm as any
      )
    ).rejects.toThrow('already belongs')
  })

  it('rejects an attachment with the same id but another type, accepts one already linked here', async () => {
    const update = (taken: any[]) =>
      service.updateHouseRent(
        'h',
        { name: 'n', rents: [rent(['a'], 'd1')], members: [], attachmentIds: [] } as any,
        makeEtm(taken) as any
      )
    await expect(
      update([{ id: 'a', attachableId: 'd1', attachableType: 'house_rent' }])
    ).rejects.toThrow('already belongs')
    await expect(
      update([{ id: 'a', attachableId: 'd1', attachableType: detailType }])
    ).resolves.toBeDefined()
  })

  it('soft-deletes attachments of removed details', async () => {
    const etm = makeEtm([], [{ id: 'gone' }])
    await service.updateHouseRent(
      'h',
      { name: 'n', rents: [rent([], 'd1')], members: [], attachmentIds: [] } as any,
      etm as any
    )
    expect(etm.softDelete).toHaveBeenCalledWith(AttachmentEntity, {
      attachableType: detailType,
      attachableId: In(['gone']),
    })
  })
})
