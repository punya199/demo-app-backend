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
      save: jest.fn((entity: { name: string }) => {
        calls.push(`save:${entity.name}`)
        return Promise.resolve()
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
