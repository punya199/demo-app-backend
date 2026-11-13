import { DataSource } from 'typeorm'
import { ENERGY_CAP, ENERGY_REGEN_MS } from './energy'
import { TdProfileService } from './td-profile.service'

const T0 = new Date('2026-01-01T00:00:00Z')

// DB-free stand-in that fails the test if the read opens a transaction or takes a lock.
const fake = (row: { energy: number; energyUpdatedAt: Date } | null) => {
  const findOne = jest.fn((_e: unknown, opts: { lock?: unknown }) => {
    if (opts.lock) throw new Error('lock taken')
    return Promise.resolve(row)
  })
  const builder = {
    select: () => builder,
    addSelect: () => builder,
    where: () => builder,
    groupBy: () => builder,
    getRawMany: () => Promise.resolve([{ currency: 'coins', total: '5' }]),
  }
  const dataSource = {
    transaction: jest.fn(() => {
      throw new Error('transaction opened')
    }),
    manager: { findOne, createQueryBuilder: () => builder, update: jest.fn() },
  }
  return { service: new TdProfileService(dataSource as unknown as DataSource), dataSource }
}

describe('TdProfileService.getProfile', () => {
  it('computes regenerated energy in memory, without a transaction, a lock or a write', async () => {
    const { service, dataSource } = fake({ energy: 0, energyUpdatedAt: T0 })
    const now = new Date(T0.getTime() + 2 * ENERGY_REGEN_MS)
    const profile = await service.getProfile('u1', now)
    expect(profile.energy.current).toBe(2)
    expect(profile.balances.coins).toBe(5)
    expect(dataSource.transaction).not.toHaveBeenCalled()
    expect(dataSource.manager.update).not.toHaveBeenCalled()
  })

  it('treats a player with no profile row as full energy', async () => {
    const { service } = fake(null)
    expect((await service.getProfile('u1', T0)).energy.current).toBe(ENERGY_CAP)
  })
})
