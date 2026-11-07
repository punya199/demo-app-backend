/* eslint-disable @typescript-eslint/no-unsafe-return -- jest mock fakes */
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { randomInt } from 'crypto'
import { EnumMonsterStage } from '../../../db/entities/monster.entity'
import { WorldBossEntity } from '../../../db/entities/world-boss.entity'
import { simulateArena } from '../arena/arena-engine'
import { arenaBattleView, arenaSpecOfFighter, toArenaFighter } from '../arena/arena-fighter'
import { countFightsInWindow } from '../arena/daily-fights'
import { applyPvpOutcome, assertCanBattle } from '../core/monster-engine'
import { MonsterRuleError } from '../core/monster-engine/types'
import { toMonsterView } from '../core/monster.service'
import { isEquipmentBagFull } from '../equipment/equipment.service'
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
const DEF = WORLD_BOSS_ROTATION[0]

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
  return { etm, monsterService, wallet, service }
}

const liveBoss = (over: Record<string, unknown> = {}) => ({
  id: 'wb-1',
  week: WEEK.key,
  bossId: DEF.id,
  hp: 500,
  maxHp: 1000,
  endsAt: WEEK.endsAt,
  defeatedAt: null,
  killedByUserId: null,
  ...over,
})

// Arena result: fighter 0 is the player, the last one is the boss. `dealt` is arena damage.
const arenaOf = (fighters: { hp: number; dealt: number }[]) =>
  (simulateArena as jest.Mock).mockReturnValue({ fighters })

beforeEach(() => {
  jest.resetAllMocks()
  jest.useFakeTimers().setSystemTime(NOW)
  ;(countFightsInWindow as jest.Mock).mockResolvedValue(0)
  ;(isEquipmentBagFull as jest.Mock).mockResolvedValue(false)
  ;(randomInt as jest.Mock).mockReturnValue(77)
  ;(toArenaFighter as jest.Mock).mockReturnValue({ name: 'player' })
  ;(arenaBattleView as jest.Mock).mockReturnValue({ rounds: ['r'], extra: true })
  ;(applyPvpOutcome as jest.Mock).mockReturnValue({ state: 'state', events: ['event'] })
  ;(toMonsterView as jest.Mock).mockImplementation(m => ({ view: m }))
  ;(arenaSpecOfFighter as jest.Mock).mockReturnValue({ name: 'converted', emoji: 'c' })
  ;(ensureCurrent as jest.Mock).mockResolvedValue(liveBoss())
})
afterEach(() => jest.useRealTimers())

describe('WorldBossService.attack guards', () => {
  it('needs a monster', async () => {
    const { service, monsterService } = setup()
    monsterService.lockAndTickLatest.mockResolvedValue(null)
    await expect(service.attack('user-1')).rejects.toThrow(
      new NotFoundException('You do not have a monster yet')
    )
  })

  it('turns a monster rule error into a 400', async () => {
    const { service } = setup()
    ;(assertCanBattle as jest.Mock).mockImplementation(() => {
      throw new MonsterRuleError('Monster is resting')
    })
    await expect(service.attack('user-1')).rejects.toThrow(
      new BadRequestException('Monster is resting')
    )
  })

  it('keeps young monsters out', async () => {
    const { service, monsterService } = setup()
    monsterService.lockAndTickLatest.mockResolvedValue(makeMonster(EnumMonsterStage.BABY_2))
    await expect(service.attack('user-1')).rejects.toThrow(
      new BadRequestException('Your monster is too young for the world boss')
    )
  })

  it('stops after the hits of the window are used', async () => {
    const { service } = setup()
    ;(countFightsInWindow as jest.Mock).mockResolvedValue(3)
    await expect(service.attack('user-1')).rejects.toThrow(
      new BadRequestException('World boss hits used up until the next reset')
    )
    expect(ensureCurrent).not.toHaveBeenCalled()
  })

  it.each([
    ['defeated', { defeatedAt: NOW }],
    ['past its end', { endsAt: NOW }],
  ])('refuses a boss that is %s', async (_name, over) => {
    const { service, etm } = setup()
    etm.findOneOrFail.mockResolvedValue(liveBoss(over))
    await expect(service.attack('user-1')).rejects.toThrow(
      new BadRequestException('World boss is not active')
    )
    expect(etm.findOneOrFail).toHaveBeenCalledWith(WorldBossEntity, {
      where: { week: WEEK.key },
      lock: { mode: 'pessimistic_write' },
    })
  })
})

describe('WorldBossService.attack fight', () => {
  it('subtracts the damage the boss lost and records it for the player', async () => {
    const { service, etm, monsterService } = setup()
    const boss = liveBoss()
    etm.findOneOrFail.mockResolvedValue(boss)
    arenaOf([
      { hp: 10, dealt: 120 },
      { hp: 50, dealt: 0 },
    ])
    ;(countFightsInWindow as jest.Mock).mockResolvedValueOnce(0).mockResolvedValueOnce(1)

    const result = await service.attack('user-1')

    // 120 arena damage = 50 week HP (scale 2.4)
    expect(boss.hp).toBe(450)
    expect(boss.defeatedAt).toBeNull()
    expect(etm.save).toHaveBeenCalledWith(WorldBossEntity, boss)
    expect(etm.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "world_boss_damage"'),
      ['wb-1', 'user-1', 50]
    )
    expect(applyPvpOutcome).toHaveBeenCalledWith(
      expect.anything(),
      false,
      { week: WEEK.key, damage: 50, seed: 77, rounds: ['r'] },
      NOW,
      'world_boss'
    )
    expect(monsterService.saveEvents).toHaveBeenCalledWith({ saved: 'state' }, ['event'], etm)
    expect(result).toMatchObject({
      damage: 50,
      ally: null,
      bossHp: 450,
      maxHp: 1000,
      isKillingBlow: false,
      hitsLeft: 2,
      battle: { damage: 50, survived: true },
      monster: { view: { saved: 'state' } },
    })
  })

  it('marks the boss defeated for the killing blow and reports a fallen player', async () => {
    const { service, etm } = setup()
    const boss = liveBoss({ hp: 40 })
    etm.findOneOrFail.mockResolvedValue(boss)
    arenaOf([
      { hp: 0, dealt: 9999 },
      { hp: 0, dealt: 0 },
    ])

    const result = await service.attack('user-1')

    expect(boss.hp).toBe(0)
    expect(boss.defeatedAt).toEqual(NOW)
    expect(boss.killedByUserId).toBe('user-1')
    expect(result).toMatchObject({
      isKillingBlow: true,
      damage: 40,
      bossHp: 0,
      battle: { survived: false },
    })
    expect(applyPvpOutcome).toHaveBeenCalledWith(
      expect.anything(),
      true,
      expect.anything(),
      NOW,
      'world_boss'
    )
  })

  it('floors hitsLeft at zero', async () => {
    const { service, etm } = setup()
    etm.findOneOrFail.mockResolvedValue(liveBoss())
    arenaOf([
      { hp: 1, dealt: 0 },
      { hp: 1, dealt: 0 },
    ])
    ;(countFightsInWindow as jest.Mock).mockResolvedValueOnce(2).mockResolvedValueOnce(9)
    expect((await service.attack('user-1')).hitsLeft).toBe(0)
  })

  it('lets a non-rule engine error through unchanged', async () => {
    const { service, etm } = setup()
    etm.findOneOrFail.mockResolvedValue(liveBoss())
    arenaOf([
      { hp: 1, dealt: 0 },
      { hp: 1, dealt: 0 },
    ])
    ;(applyPvpOutcome as jest.Mock).mockImplementation(() => {
      throw new TypeError('boom')
    })
    await expect(service.attack('user-1')).rejects.toThrow(new TypeError('boom'))
  })
})
