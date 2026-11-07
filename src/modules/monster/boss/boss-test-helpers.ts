/* eslint-disable @typescript-eslint/require-await -- jest mock fakes */
// Fakes shared by the boss service specs. No database: the "manager" is a bag of jest mocks and
// transaction(cb) just runs cb with it.
import { EnumMonsterStage } from '../../../db/entities/monster.entity'

export const NOW = new Date('2026-03-04T05:00:00Z')

export const makeMonster = (stage = EnumMonsterStage.ULTIMATE) =>
  ({ id: 'monster-1', stage }) as never

export const makeManager = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  findOneOrFail: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
  save: jest.fn().mockResolvedValue(undefined),
  query: jest.fn().mockResolvedValue([]),
  createQueryBuilder: jest.fn(),
})

export const makeDataSource = (etm: ReturnType<typeof makeManager>) => ({
  manager: etm,
  query: jest.fn(),
  transaction: jest.fn((cb: (manager: unknown) => unknown) => cb(etm)),
})

export const makeMonsterService = () => ({
  lockAndTickLatest: jest.fn(),
  getLatestAlive: jest.fn(),
  saveState: jest.fn(async (_monster: unknown, state: unknown) => ({ saved: state })),
  saveEvents: jest.fn().mockResolvedValue(undefined),
})

export const makeInventory = () => ({
  getInventory: jest.fn().mockResolvedValue({ items: [] }),
  add: jest.fn().mockResolvedValue(undefined),
  spend: jest.fn().mockResolvedValue(true),
})

export const makeWallet = () => ({
  getBalance: jest.fn().mockResolvedValue({ coin: 1 }),
  change: jest.fn(async () => ({ coin: 2 })),
  lockWallets: jest.fn().mockResolvedValue(undefined),
})
