import { EnumFriendshipStatus } from '../../../db/entities/friendship.entity'

// Chainable fake EntityManager: every method is a jest.fn, query-builder methods return itself.
export const makeEtm = () => {
  const etm: Record<string, jest.Mock> = {}
  for (const name of [
    'find',
    'findOne',
    'count',
    'save',
    'update',
    'softDelete',
    'query',
    'execute',
    'getMany',
  ]) {
    etm[name] = jest.fn()
  }
  for (const name of ['createQueryBuilder', 'insert', 'into', 'values', 'orIgnore', 'where']) {
    etm[name] = jest.fn(() => etm)
  }
  return etm
}

export const makeDataSource = (etm: ReturnType<typeof makeEtm>) => ({
  manager: etm,
  transaction: jest.fn((cb: (m: unknown) => unknown) => cb(etm)),
})

export const ME = '00000000-0000-4000-8000-000000000001'
export const OTHER = '00000000-0000-4000-8000-000000000002'
export const THIRD = '00000000-0000-4000-8000-000000000003'

export const friendship = (overrides: Record<string, unknown> = {}) => ({
  id: 'rel-1',
  userLow: ME,
  userHigh: OTHER,
  requestedBy: ME,
  status: EnumFriendshipStatus.ACCEPTED,
  points: 0,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
})
