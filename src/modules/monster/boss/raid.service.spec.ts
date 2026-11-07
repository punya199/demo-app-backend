/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access -- jest mock fakes */
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { randomInt } from 'crypto'
import { EnumMonsterStage } from '../../../db/entities/monster.entity'
import { RaidProgressEntity } from '../../../db/entities/raid-progress.entity'
import { EnumEquipmentGrade, EnumEquipmentSlot } from '../equipment/equipment-data'
import { MonsterRuleError } from '../core/monster-engine/types'
import { simulateArena } from '../arena/arena-engine'
import { arenaBattleView, toArenaFighter } from '../arena/arena-fighter'
import { countFightsInWindow } from '../arena/daily-fights'
import {
  grantItem,
  isEquipmentBagFull,
  rand,
  toEquipmentView,
} from '../equipment/equipment.service'
import { applyPvpOutcome, assertCanBattle } from '../core/monster-engine'
import { toMonsterView } from '../core/monster.service'
import {
  makeDataSource,
  makeInventory,
  makeManager,
  makeMonster,
  makeMonsterService,
  makeWallet,
  NOW,
} from './boss-test-helpers'
import { bossTokenItemId, RAID_BOSSES, RAID_DIFFICULTIES, RAID_EXCHANGE_COST } from './raid-data'
import { RaidService } from './raid.service'

jest.mock('crypto', () => ({ ...jest.requireActual('crypto'), randomInt: jest.fn() }))
jest.mock('../arena/arena-engine', () => ({
  ...jest.requireActual('../arena/arena-engine'),
  simulateArena: jest.fn(),
}))
jest.mock('../arena/arena-fighter', () => ({
  ...jest.requireActual('../arena/arena-fighter'),
  toArenaFighter: jest.fn(),
  arenaBattleView: jest.fn(),
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

const BOSS = RAID_BOSSES[0]
const [NORMAL, HARD, NIGHTMARE] = RAID_DIFFICULTIES

const setup = () => {
  const etm = makeManager()
  const dataSource = makeDataSource(etm)
  const monsterService = makeMonsterService()
  const inventory = makeInventory()
  const wallet = makeWallet()
  const service = new RaidService(
    dataSource as never,
    monsterService as never,
    inventory as never,
    wallet as never
  )
  return { etm, dataSource, monsterService, inventory, wallet, service }
}

beforeEach(() => {
  jest.resetAllMocks()
  jest.useFakeTimers().setSystemTime(NOW)
  ;(countFightsInWindow as jest.Mock).mockResolvedValue(0)
  ;(isEquipmentBagFull as jest.Mock).mockResolvedValue(false)
  ;(randomInt as jest.Mock).mockReturnValue(0)
  ;(applyPvpOutcome as jest.Mock).mockReturnValue({ state: 'state', events: ['event'] })
  ;(simulateArena as jest.Mock).mockReturnValue({})
  ;(grantItem as jest.Mock).mockResolvedValue({ id: 'piece-1' })
  ;(toArenaFighter as jest.Mock).mockReturnValue({ name: 'player' })
  ;(toEquipmentView as jest.Mock).mockImplementation((row: { id: string }) => ({ view: row.id }))
  ;(rand as jest.Mock).mockReturnValue(0.5)
  ;(toMonsterView as jest.Mock).mockImplementation(m => ({ view: m }))
})
afterEach(() => jest.useRealTimers())

describe('RaidService.getRaid', () => {
  it('lists every boss with progress, tokens owned and unlock state', async () => {
    const { service, etm, monsterService, inventory } = setup()
    etm.find.mockResolvedValue([
      { bossId: BOSS.id, difficulty: NORMAL.difficulty, clearCount: 2 },
      { bossId: BOSS.id, difficulty: HARD.difficulty, clearCount: 0 },
    ])
    ;(countFightsInWindow as jest.Mock).mockResolvedValue(2)
    inventory.getInventory.mockResolvedValue({
      items: [{ itemId: bossTokenItemId(BOSS.id), quantity: 7 }],
    })
    monsterService.getLatestAlive.mockResolvedValue({ stage: EnumMonsterStage.PERFECT })

    const result = await service.getRaid('user-1')

    expect(etm.find).toHaveBeenCalledWith(RaidProgressEntity, { where: { userId: 'user-1' } })
    expect(result.attemptsLeft).toBe(1)
    expect(result.resetsAt).toBeInstanceOf(Date)
    expect(result.bosses).toHaveLength(RAID_BOSSES.length)
    const first = result.bosses[0]
    expect(first.bossTokens).toBe(7)
    expect(result.bosses[1].bossTokens).toBe(0)
    expect(first.setName).toBeTruthy()
    expect(first.detail.skills.length).toBeGreaterThan(0)
    const [normal, hard, nightmare] = first.difficulties
    expect(normal).toMatchObject({ clearCount: 2, unlocked: true, exchangeCost: 20 })
    // form is enough but the Normal clear counts for Hard; Hard itself has no clears
    expect(hard).toMatchObject({ clearCount: 0, unlocked: true })
    // stage too low for Nightmare, and Hard is not cleared
    expect(nightmare.unlocked).toBe(false)
    expect(hard.enemy.name).toBe(BOSS.name)
    expect(hard.defReductionPct).toBeGreaterThan(0)
    // another boss with no progress: Normal is open, the rest are locked by the clear rule
    expect(result.bosses[1].difficulties.map(d => d.unlocked)).toEqual([true, false, false])
  })

  it('locks everything without a monster and never reports negative attempts', async () => {
    const { service, monsterService } = setup()
    ;(countFightsInWindow as jest.Mock).mockResolvedValue(99)
    monsterService.getLatestAlive.mockResolvedValue(null)
    const result = await service.getRaid('user-1')
    expect(result.attemptsLeft).toBe(0)
    expect(result.bosses.every(b => b.difficulties.every(d => !d.unlocked))).toBe(true)
  })

  it('falls back to the set id when the set has no definition', async () => {
    const { service, monsterService } = setup()
    monsterService.getLatestAlive.mockResolvedValue(null)
    const original = BOSS.setId
    ;(BOSS as { setId: string }).setId = 'ghost-set'
    try {
      const result = await service.getRaid('user-1')
      expect(result.bosses[0].setName).toBe('ghost-set')
    } finally {
      ;(BOSS as { setId: string }).setId = original
    }
  })
})

describe('RaidService.battle guards', () => {
  const run = (service: RaidService, boss = BOSS.id, difficulty: string = NORMAL.difficulty) =>
    service.battle('user-1', boss, difficulty)

  it('rejects unknown boss or difficulty before opening a transaction', async () => {
    const { service, dataSource } = setup()
    await expect(run(service, 'nope')).rejects.toThrow(new NotFoundException('Boss not found'))
    await expect(run(service, BOSS.id, 'nope')).rejects.toThrow(
      new NotFoundException('Boss not found')
    )
    expect(dataSource.transaction).not.toHaveBeenCalled()
  })

  it('needs a monster', async () => {
    const { service, monsterService } = setup()
    monsterService.lockAndTickLatest.mockResolvedValue(null)
    await expect(run(service)).rejects.toThrow(
      new NotFoundException('You do not have a monster yet')
    )
  })

  it('turns a monster rule error into a 400 with its message', async () => {
    const { service, monsterService } = setup()
    monsterService.lockAndTickLatest.mockResolvedValue(makeMonster())
    ;(assertCanBattle as jest.Mock).mockImplementation(() => {
      throw new MonsterRuleError('Monster is resting')
    })
    await expect(run(service)).rejects.toThrow(new BadRequestException('Monster is resting'))
  })

  it('refuses a form below the difficulty minimum', async () => {
    const { service, monsterService } = setup()
    monsterService.lockAndTickLatest.mockResolvedValue(makeMonster(EnumMonsterStage.ADULT))
    await expect(run(service, BOSS.id, HARD.difficulty)).rejects.toThrow(
      new BadRequestException('Your monster is not strong enough for this difficulty')
    )
  })

  it('needs the previous difficulty cleared (missing or zero clears)', async () => {
    const { service, monsterService, etm } = setup()
    monsterService.lockAndTickLatest.mockResolvedValue(makeMonster())
    const message = new BadRequestException('Clear the previous difficulty first')
    await expect(run(service, BOSS.id, HARD.difficulty)).rejects.toThrow(message)
    etm.find.mockResolvedValue([{ bossId: BOSS.id, difficulty: NORMAL.difficulty, clearCount: 0 }])
    await expect(run(service, BOSS.id, HARD.difficulty)).rejects.toThrow(message)
  })

  it('stops when the attempts of the window are used up', async () => {
    const { service, monsterService } = setup()
    monsterService.lockAndTickLatest.mockResolvedValue(makeMonster())
    ;(countFightsInWindow as jest.Mock).mockResolvedValue(3)
    await expect(run(service)).rejects.toThrow(
      new BadRequestException('Raid attempts used up until the next reset')
    )
  })

  it('refuses before fighting when the equipment bag is full', async () => {
    const { service, monsterService } = setup()
    monsterService.lockAndTickLatest.mockResolvedValue(makeMonster())
    ;(isEquipmentBagFull as jest.Mock).mockResolvedValue(true)
    await expect(run(service)).rejects.toThrow(new BadRequestException('Equipment bag is full'))
    expect(simulateArena).not.toHaveBeenCalled()
  })

  it('lets a non-rule error from the engine through unchanged', async () => {
    const { service, monsterService } = setup()
    monsterService.lockAndTickLatest.mockResolvedValue(makeMonster())
    ;(arenaBattleView as jest.Mock).mockReturnValue({ won: false, rounds: [] })
    ;(applyPvpOutcome as jest.Mock).mockImplementation(() => {
      throw new TypeError('boom')
    })
    await expect(run(service)).rejects.toThrow(new TypeError('boom'))
  })
})

describe('RaidService.battle fight', () => {
  const fight = (won: boolean) =>
    (arenaBattleView as jest.Mock).mockReturnValue({ won, rounds: ['r1'], extra: 1 })

  it('records a loss without any reward or progress', async () => {
    const { service, monsterService, etm, wallet, inventory } = setup()
    const monster = makeMonster()
    monsterService.lockAndTickLatest.mockResolvedValue(monster)
    fight(false)

    const result = await service.battle('user-1', BOSS.id, NORMAL.difficulty)

    expect(applyPvpOutcome).toHaveBeenCalledWith(
      monster,
      false,
      { bossId: BOSS.id, difficulty: NORMAL.difficulty, seed: 0, rounds: ['r1'] },
      NOW,
      'raid'
    )
    expect(monsterService.saveEvents).toHaveBeenCalledWith({ saved: 'state' }, ['event'], etm)
    expect(etm.save).not.toHaveBeenCalled()
    expect(wallet.change).not.toHaveBeenCalled()
    expect(inventory.add).not.toHaveBeenCalled()
    expect(grantItem).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      isFirstClear: false,
      raidTokens: 0,
      bossTokens: 0,
      refineStone: null,
      craftCores: [],
      drop: null,
      monster: { view: { saved: 'state' } },
      attemptsLeft: 2,
      wallet: { coin: 1 },
    })
  })

  it('pays a first Normal clear: doubled tokens, boss token, a piece, new progress', async () => {
    const { service, monsterService, etm, wallet, inventory } = setup()
    monsterService.lockAndTickLatest.mockResolvedValue(makeMonster())
    fight(true)

    const result = await service.battle('user-1', BOSS.id, NORMAL.difficulty)

    expect(etm.save).toHaveBeenCalledWith(RaidProgressEntity, {
      userId: 'user-1',
      bossId: BOSS.id,
      difficulty: NORMAL.difficulty,
      clearCount: 1,
      firstClearedAt: NOW,
    })
    expect(wallet.change).toHaveBeenCalledWith(
      'user-1',
      'raid_token',
      NORMAL.raidTokens * 2,
      'raid_reward',
      `${BOSS.id}:${NORMAL.difficulty}`,
      etm
    )
    expect(inventory.add).toHaveBeenCalledWith('user-1', bossTokenItemId(BOSS.id), etm, 1)
    expect(grantItem).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ grade: EnumEquipmentGrade.RARE }),
      `raid:${BOSS.id}:${NORMAL.difficulty}`,
      etm
    )
    expect((grantItem as jest.Mock).mock.calls[0][1].slot).toBe(Object.values(EnumEquipmentSlot)[0])
    expect(result).toMatchObject({
      isFirstClear: true,
      raidTokens: NORMAL.raidTokens * 2,
      bossTokens: 1,
      refineStone: null,
      drop: { view: 'piece-1' },
      wallet: { coin: 2 },
    })
  })

  it('pays a repeat Nightmare clear: single tokens, refine stone, cores, no new progress row', async () => {
    const { service, monsterService, etm, inventory } = setup()
    monsterService.lockAndTickLatest.mockResolvedValue(makeMonster())
    const existing = { bossId: BOSS.id, difficulty: NIGHTMARE.difficulty, clearCount: 4 }
    etm.find.mockResolvedValue([
      { bossId: BOSS.id, difficulty: HARD.difficulty, clearCount: 1 },
      existing,
    ])
    fight(true)

    const result = await service.battle('user-1', BOSS.id, NIGHTMARE.difficulty)

    expect(existing.clearCount).toBe(5)
    expect(etm.save).toHaveBeenCalledWith(RaidProgressEntity, existing)
    expect(result.isFirstClear).toBe(false)
    expect(result.raidTokens).toBe(NIGHTMARE.raidTokens)
    expect(result.refineStone).toBe(NIGHTMARE.refineStone)
    expect(inventory.add).toHaveBeenCalledWith('user-1', NIGHTMARE.refineStone, etm)
    expect(result.craftCores.length).toBeGreaterThan(0)
    for (const core of result.craftCores) {
      expect(inventory.add).toHaveBeenCalledWith('user-1', core.itemId, etm, core.qty)
    }
  })

  it('reports no drop when the piece could not be granted', async () => {
    const { service, monsterService } = setup()
    monsterService.lockAndTickLatest.mockResolvedValue(makeMonster())
    ;(grantItem as jest.Mock).mockResolvedValue(null)
    fight(true)
    const result = await service.battle('user-1', BOSS.id, NORMAL.difficulty)
    expect(result.drop).toBeNull()
  })
})

describe('RaidService.exchange', () => {
  const slot = EnumEquipmentSlot.WEAPON ?? Object.values(EnumEquipmentSlot)[0]
  const rare = EnumEquipmentGrade.RARE

  it.each([
    ['unknown boss', 'nope', rare],
    ['ungated grade', BOSS.id, EnumEquipmentGrade.MYTHIC],
    ['grade without a price', BOSS.id, EnumEquipmentGrade.COMMON],
  ])('does not know an exchange for %s', async (_name, bossId, grade) => {
    const { service, dataSource } = setup()
    await expect(service.exchange('user-1', bossId, slot, grade)).rejects.toThrow(
      new NotFoundException('Exchange not found')
    )
    expect(dataSource.transaction).not.toHaveBeenCalled()
  })

  it('needs a clear of the difficulty that drops the grade', async () => {
    const { service, etm } = setup()
    const message = new BadRequestException('Clear this difficulty first')
    await expect(service.exchange('user-1', BOSS.id, slot, rare)).rejects.toThrow(message)
    etm.findOne.mockResolvedValue({ clearCount: 0 })
    await expect(service.exchange('user-1', BOSS.id, slot, rare)).rejects.toThrow(message)
    expect(etm.findOne).toHaveBeenCalledWith(RaidProgressEntity, {
      where: { userId: 'user-1', bossId: BOSS.id, difficulty: NORMAL.difficulty },
    })
  })

  it('refuses a full bag before spending tokens', async () => {
    const { service, etm, inventory } = setup()
    etm.findOne.mockResolvedValue({ clearCount: 1 })
    ;(isEquipmentBagFull as jest.Mock).mockResolvedValue(true)
    await expect(service.exchange('user-1', BOSS.id, slot, rare)).rejects.toThrow(
      new BadRequestException('Equipment bag is full')
    )
    expect(inventory.spend).not.toHaveBeenCalled()
  })

  it('refuses when the boss tokens are not enough', async () => {
    const { service, etm, inventory } = setup()
    etm.findOne.mockResolvedValue({ clearCount: 1 })
    inventory.spend.mockResolvedValue(false)
    await expect(service.exchange('user-1', BOSS.id, slot, rare)).rejects.toThrow(
      new BadRequestException('Not enough boss tokens')
    )
    expect(grantItem).not.toHaveBeenCalled()
  })

  it('spends the tokens, grants the chosen piece and returns the bag', async () => {
    const { service, etm, inventory } = setup()
    etm.findOne.mockResolvedValue({ clearCount: 1 })
    inventory.getInventory.mockResolvedValue({ items: [{ itemId: 'x', quantity: 1 }] })

    const result = await service.exchange('user-1', BOSS.id, slot, rare)

    expect(inventory.spend).toHaveBeenCalledWith(
      'user-1',
      bossTokenItemId(BOSS.id),
      RAID_EXCHANGE_COST[rare],
      etm
    )
    expect(grantItem).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ grade: rare, slot }),
      `exchange:${BOSS.id}`,
      etm
    )
    expect(result).toEqual({ item: { view: 'piece-1' }, items: [{ itemId: 'x', quantity: 1 }] })
  })
})
