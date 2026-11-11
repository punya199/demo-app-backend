import { EntityManager } from 'typeorm'
import { MonsterEntity } from '../../../db/entities/monster.entity'
import { monster, NOW } from './monster-engine/test-fixtures'

export { NOW }

// A stored pet: the engine fixture (an adult that was last ticked at NOW) plus the row columns.
export const pet = (overrides: Record<string, unknown> = {}) =>
  ({
    ...monster({ lastTickAt: NOW, bornAt: NOW }),
    id: 'pet-1',
    ownerId: 'user-1',
    nickname: null,
    selectedAt: NOW,
    lastRenamedAt: null,
    skillLoadout: null,
    ...overrides,
  }) as unknown as MonsterEntity

// A fake manager: save() echoes what it is given, everything else is a bare mock to program.
export const fakeEtm = () => {
  const etm = {
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    update: jest.fn().mockResolvedValue(undefined),
    softDelete: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(),
    save: jest.fn((_entity: unknown, value: unknown) => Promise.resolve(value)),
    createQueryBuilder: jest.fn(),
  }
  return etm as typeof etm & EntityManager
}

// transaction(cb) runs cb with the given fake manager; program getRepository per test.
export const fakeDataSource = (etm: object) => ({
  manager: etm,
  transaction: jest.fn((cb: (m: object) => unknown) => cb(etm)),
  getRepository: jest.fn(),
})

// A chainable insert query builder whose execute() resolves to `result`.
export const fakeInsertBuilder = (result: unknown) => {
  const builder: Record<string, jest.Mock> = {}
  for (const name of ['insert', 'into', 'values', 'orIgnore', 'returning']) {
    builder[name] = jest.fn(() => builder)
  }
  builder.execute = jest.fn().mockResolvedValue(result)
  return builder
}
