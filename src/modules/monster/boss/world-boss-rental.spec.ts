/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await -- jest mock fakes */
import { BadRequestException } from '@nestjs/common'
import { randomInt } from 'crypto'
import { RentalEntity } from '../../../db/entities/rental.entity'
import { WorldBossEntity } from '../../../db/entities/world-boss.entity'
import { simulateArena } from '../arena/arena-engine'
import { arenaBattleView, arenaSpecOfFighter, toArenaFighter } from '../arena/arena-fighter'
import { countFightsInWindow } from '../arena/daily-fights'
import { applyPvpOutcome } from '../core/monster-engine'
import { toMonsterView } from '../core/monster.service'
import { FRIEND_POINTS_RENTAL, RENTAL_FEE, RENTAL_OWNER_DAILY_CAP } from '../core/monster-rules'
import {
  makeDataSource,
  makeInventory,
  makeManager,
  makeMonster,
  makeMonsterService,
  makeWallet,
  NOW,
} from './boss-test-helpers'
import { getWeek, WORLD_BOSS_ROTATION } from './world-boss-data'
import { ensureCurrent } from './world-boss-queries'
import { WorldBossService } from './world-boss.service'

jest.mock('crypto', () => ({ ...jest.requireActual('crypto'), randomInt: jest.fn() }))
jest.mock('../arena/arena-engine', () => ({
  ...jest.requireActual('../arena/arena-engine'),
  simulateArena: jest.fn(),
}))
jest.mock('../arena/arena-fighter', () => ({
  ...jest.requireActual('../arena/arena-fighter'),
  toArenaFighter: jest.fn(),
  arenaBattleView: jest.fn(),
  arenaSpecOfFighter: jest.fn(),
}))
jest.mock('../arena/daily-fights', () => ({
  ...jest.requireActual('../arena/daily-fights'),
  countFightsInWindow: jest.fn(),
}))
jest.mock('../passive/skill.service', () => ({ loadArenaLoadout: jest.fn() }))
jest.mock('../equipment/equipment.service', () => ({
  grantItem: jest.fn(),
  isEquipmentBagFull: jest.fn(),
  loadEquipmentBonus: jest.fn(),
  rand: jest.fn(),
  toEquipmentView: jest.fn(),
}))
jest.mock('../core/monster.service', () => ({
  ...jest.requireActual('../core/monster.service'),
  toMonsterView: jest.fn(),
}))
jest.mock('../core/monster-engine', () => ({
  ...jest.requireActual('../core/monster-engine'),
  applyPvpOutcome: jest.fn(),
  assertCanBattle: jest.fn(),
}))
jest.mock('./world-boss-queries', () => ({
  ...jest.requireActual('./world-boss-queries'),
  ensureCurrent: jest.fn(),
}))

const WEEK = getWeek(NOW)
const UNIT_ID = '8f6b6a3e-5c1d-4e57-9b0a-2d1f3c4b5a69'
const OWNER = 'owner-1'
const unavailable = new BadRequestException('Support unit is not available')

const setup = () => {
  const etm = makeManager()
  const monsterService = makeMonsterService()
  const wallet = makeWallet()
  const service = new WorldBossService(
    makeDataSource(etm) as never,
    monsterService as never,
    makeInventory() as never,
    wallet as never
  )
  monsterService.lockAndTickLatest.mockResolvedValue(makeMonster())
  const boss = {
    id: 'wb-1',
    week: WEEK.key,
    bossId: WORLD_BOSS_ROTATION[0].id,
    hp: 500,
    maxHp: 1000,
    endsAt: WEEK.endsAt,
    defeatedAt: null,
    killedByUserId: null,
  }
  etm.findOneOrFail.mockResolvedValue(boss)
  return { etm, wallet, service, boss }
}

// Unit lookup first, then the friendship lookup.
const lend = (etm: ReturnType<typeof makeManager>, unit: unknown, friendship: unknown) =>
  etm.findOne.mockResolvedValueOnce(unit).mockResolvedValueOnce(friendship)

const unit = (over: Record<string, unknown> = {}) => ({
  id: UNIT_ID,
  userId: OWNER,
  arenaFighter: { name: 'ally', emoji: 'a' },
  fighter: { name: 'legacy' },
  ...over,
})

beforeEach(() => {
  jest.resetAllMocks()
  jest.useFakeTimers().setSystemTime(NOW)
  ;(countFightsInWindow as jest.Mock).mockResolvedValue(0)
  ;(randomInt as jest.Mock).mockReturnValue(5)
  ;(toArenaFighter as jest.Mock).mockReturnValue({ name: 'player' })
  ;(arenaBattleView as jest.Mock).mockReturnValue({ rounds: [] })
  ;(applyPvpOutcome as jest.Mock).mockReturnValue({ state: 's', events: [] })
  ;(toMonsterView as jest.Mock).mockImplementation(m => m)
  ;(arenaSpecOfFighter as jest.Mock).mockReturnValue({ name: 'converted', emoji: 'c' })
  ;(ensureCurrent as jest.Mock).mockResolvedValue({})
})
afterEach(() => jest.useRealTimers())

describe('WorldBossService.attack with a rented ally', () => {
  it.each([
    ['an id that is not a uuid', 'not-a-uuid', null, null],
    ['an unknown unit', UNIT_ID, null, null],
    ['my own unit', UNIT_ID, unit({ userId: 'user-1' }), null],
    ['a unit of a stranger', UNIT_ID, unit(), null],
  ])('answers the same for %s', async (_name, supportId, found, friendship) => {
    const { service, etm, wallet } = setup()
    if (supportId === UNIT_ID) {
      lend(etm, found, friendship)
    }
    await expect(service.attack('user-1', supportId)).rejects.toThrow(unavailable)
    expect(wallet.lockWallets).not.toHaveBeenCalled()
  })

  it('looks the friendship up as an accepted pair, ordered', async () => {
    const { service, etm } = setup()
    lend(etm, unit(), null)
    await expect(service.attack('user-1', UNIT_ID)).rejects.toThrow(unavailable)
    expect(etm.findOne).toHaveBeenLastCalledWith(expect.anything(), {
      where: { userLow: OWNER, userHigh: 'user-1', status: 'accepted' },
    })
  })

  it('charges the fee, pays the owner, raises friendship and fights two on one', async () => {
    const { service, etm, wallet, boss } = setup()
    lend(etm, unit(), { id: 'friendship-1' })
    etm.query.mockImplementation(async (sql: string) =>
      sql.includes('"rentals"') ? [{ total: 30 }] : []
    )
    ;(simulateArena as jest.Mock).mockReturnValue({
      fighters: [
        { hp: 5, dealt: 240 },
        { hp: 5, dealt: 120 },
        { hp: 9, dealt: 0 },
      ],
    })

    const result = await service.attack('user-1', UNIT_ID)

    expect(wallet.lockWallets).toHaveBeenCalledWith(['user-1', OWNER], etm)
    expect(wallet.change).toHaveBeenNthCalledWith(
      1,
      'user-1',
      'coin',
      -RENTAL_FEE,
      'rental_fee',
      UNIT_ID,
      etm
    )
    expect(wallet.change).toHaveBeenNthCalledWith(
      2,
      OWNER,
      'coin',
      RENTAL_FEE,
      'rental_income',
      UNIT_ID,
      etm
    )
    expect(etm.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE "friendships"'), [
      'friendship-1',
      FRIEND_POINTS_RENTAL,
    ])
    const teams = (simulateArena as jest.Mock).mock.calls[0][0]
    expect(teams[0]).toHaveLength(2)
    expect(teams[0][1]).toEqual({ name: 'ally', emoji: 'a' })
    // own 240 -> 100, ally 120 -> 50, boss keeps 350
    expect(boss.hp).toBe(350)
    expect(etm.save).toHaveBeenCalledWith(RentalEntity, {
      renterId: 'user-1',
      ownerId: OWNER,
      supportUnitId: UNIT_ID,
      worldBossId: 'wb-1',
      fee: RENTAL_FEE,
      allyDamage: 50,
    })
    expect(etm.save).toHaveBeenCalledWith(WorldBossEntity, boss)
    expect(result).toMatchObject({
      damage: 100,
      ally: { name: 'ally', emoji: 'a', damage: 50, fee: RENTAL_FEE },
    })
  })

  it('rents for free once the owner is at the daily cap, and converts a legacy fighter', async () => {
    const { service, etm, wallet } = setup()
    lend(etm, unit({ arenaFighter: null }), { id: 'friendship-1' })
    etm.query.mockImplementation(async (sql: string) =>
      sql.includes('"rentals"') ? [{ total: RENTAL_OWNER_DAILY_CAP }] : []
    )
    ;(simulateArena as jest.Mock).mockReturnValue({
      fighters: [
        { hp: 5, dealt: 0 },
        { hp: 5, dealt: 0 },
        { hp: 9, dealt: 0 },
      ],
    })

    const result = await service.attack('user-1', UNIT_ID)

    expect(wallet.change).not.toHaveBeenCalled()
    expect(arenaSpecOfFighter).toHaveBeenCalledWith({ name: 'legacy' })
    expect(result.ally).toMatchObject({ name: 'converted', emoji: 'c', fee: 0 })
  })
})
