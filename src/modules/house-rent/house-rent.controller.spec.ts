import { HouseRentController } from './house-rent.controller'

describe('HouseRentController', () => {
  const etm = { id: 'etm' }
  const service = {
    createHouseRent: jest.fn().mockResolvedValue('created'),
    updateHouseRent: jest.fn().mockResolvedValue('updated'),
    getHouseRentOverview: jest.fn().mockResolvedValue('overview'),
    getHouseRentUser: jest.fn().mockResolvedValue('user'),
    getHouseRentUsers: jest.fn().mockResolvedValue('users'),
    getHouseRent: jest.fn().mockResolvedValue('one'),
    getHouseRents: jest.fn().mockResolvedValue('list'),
    deleteHouseRent: jest.fn().mockResolvedValue('deleted'),
  }
  const dataSource = { transaction: jest.fn((cb: (e: unknown) => unknown) => cb(etm)) }
  const controller = new HouseRentController(service as any, dataSource as any)

  it('creates inside a transaction', async () => {
    const body = { name: 'n' } as any
    expect(await controller.createHouseRent(body)).toBe('created')
    expect(service.createHouseRent).toHaveBeenCalledWith(body, etm)
  })

  it('updates inside a transaction', async () => {
    const body = { name: 'n' } as any
    expect(await controller.updateHouseRent('h', body)).toBe('updated')
    expect(service.updateHouseRent).toHaveBeenCalledWith('h', body, etm)
  })

  it('delegates reads and delete to the service', async () => {
    expect(await controller.getHouseRentOverview()).toBe('overview')
    expect(await controller.getHouseRentUser('u')).toBe('user')
    expect(await controller.getHouseRentUsers()).toBe('users')
    expect(await controller.getHouseRent('h')).toBe('one')
    expect(await controller.getHouseRents()).toBe('list')
    expect(await controller.deleteHouseRent('h')).toBe('deleted')
    expect(service.getHouseRentUser).toHaveBeenCalledWith('u')
    expect(service.deleteHouseRent).toHaveBeenCalledWith('h')
  })
})
