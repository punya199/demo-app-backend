/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- jest mocks of untyped collaborators */
import { DataSource } from 'typeorm'
import { EnumMonsterLine, EnumMonsterStage } from '../../../db/entities/monster.entity'
import { WalletService } from '../../wallet/wallet.service'
import { ProfileService } from '../core/profile.service'
import { MonsterService } from '../core/monster.service'
import { wellCaredState } from './arena-test-helpers'
import { PvpService } from './pvp.service'

// Shared fakes for the PvpService specs: no database, every collaborator a jest mock.

export const PVP_NOW = new Date('2026-01-15T03:00:00Z')
export const PVP_SEASON = '2026-W03'

// Only the clock's Date is faked, so promises and timers behave normally.
export const freezeClock = () =>
  jest.useFakeTimers({
    now: PVP_NOW,
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  })

export const makeMonster = (overrides: Record<string, unknown> = {}) =>
  ({
    ...wellCaredState(EnumMonsterLine.FLAME, EnumMonsterStage.ADULT),
    id: 'monster-1',
    ownerId: 'user-1',
    diedAt: null,
    ...overrides,
  }) as never as Record<string, any>

export const makeEtm = () => {
  const builder: Record<string, jest.Mock> = {}
  for (const key of ['update', 'set', 'where']) {
    builder[key] = jest.fn().mockReturnValue(builder)
  }
  builder.execute = jest.fn().mockResolvedValue({ affected: 1 })
  return {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    query: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockImplementation(async (_entity, value) => value),
    createQueryBuilder: jest.fn().mockReturnValue(builder),
    builder,
  }
}

export const makeService = () => {
  const etm = makeEtm()
  const dataSource = {
    manager: etm,
    query: jest.fn().mockResolvedValue([]),
    transaction: jest.fn().mockImplementation(async (cb: (m: unknown) => unknown) => cb(etm)),
  }
  const monsterService = {
    lockAndTickLatest: jest.fn(),
    getLatestAlive: jest.fn(),
    saveState: jest.fn().mockImplementation(async (_monster, state) => ({ ...state, id: 'saved' })),
    saveEvents: jest.fn().mockResolvedValue(undefined),
  }
  const walletService = { change: jest.fn().mockResolvedValue({ coin: 100 }) }
  const profileService = {
    ensureProfile: jest.fn().mockResolvedValue({ displayName: 'Me' }),
    setDisplayName: jest.fn().mockResolvedValue(undefined),
    getNames: jest.fn().mockResolvedValue(new Map()),
  }
  const service = new PvpService(
    dataSource as unknown as DataSource,
    monsterService as unknown as MonsterService,
    walletService as unknown as WalletService,
    profileService as unknown as ProfileService
  )
  return { service, etm, dataSource, monsterService, walletService, profileService }
}
