/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- jest mock fakes */
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { randomInt } from 'crypto'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../../db/entities/wallet-transaction.entity'
import { AdventureService } from './adventure.service'
import { findArenaStage, arenaEnemyOf, toArenaFighter } from '../arena/arena-fighter'
import { simulateArena } from '../arena/arena-engine'
import { rollAdventureEssence } from '../equipment/craft-data'
import { grantEquipment } from '../equipment/equipment.service'
import { loadSpecialBonus } from '../core/special-bonus'
import { applyAdventureSkip, applyBattleOutcome, assertCanAdventure } from '../core/monster-engine'

jest.mock('crypto', () => ({ ...jest.requireActual('crypto'), randomInt: jest.fn() }))
jest.mock('../arena/arena-fighter', () => ({
  arenaEnemyOf: jest.fn(),
  cleanArenaLoadout: jest.fn(() => ({ s1: null, s2: null, dodge: null })),
  findArenaStage: jest.fn(),
  toArenaFighter: jest.fn(),
}))
jest.mock('../arena/arena-engine', () => ({
  getArenaSkill: jest.fn((id: string) => ({ id })),
  simulateArena: jest.fn(),
}))
jest.mock('../arena/arena-replay', () => ({ toArenaReplay: jest.fn(() => 'replay') }))
jest.mock('../passive/skill.service', () => ({ loadUnlockedArenaSkills: jest.fn(async () => []) }))
jest.mock('../passive/passive.service', () => ({
  loadPassiveBonus: jest.fn(async () => ({ equipmentDropMultiplier: 1 })),
}))
jest.mock('../equipment/craft-data', () => ({ rollAdventureEssence: jest.fn(() => null) }))
jest.mock('../equipment/equipment-data', () => ({
  DROP_GRADE_RATES_BY_AREA: { meadow: { common: 100 } },
  rollGrade: jest.fn(() => 'common'),
}))
jest.mock('../equipment/equipment.service', () => ({
  grantEquipment: jest.fn(),
  loadEquipmentBonus: jest.fn(async () => undefined),
  toEquipmentView: jest.fn((row: { id: string }) => ({ view: row.id })),
}))
jest.mock('../core/special-bonus', () => ({ loadSpecialBonus: jest.fn() }))
jest.mock('../core/monster-engine', () => ({
  applyAdventureSkip: jest.fn(),
  applyBattleOutcome: jest.fn(),
  assertCanAdventure: jest.fn(),
}))
jest.mock('../core/monster.service', () => ({
  MonsterService: class {},
  toMonsterView: jest.fn((m: unknown) => ({ view: m })),
  withRuleErrors: (fn: () => unknown) => fn(),
}))

const NOW = new Date('2026-05-01T05:00:00Z')
const m = (fn: unknown) => fn as jest.Mock<any, any>

describe('AdventureService', () => {
  const etm = { find: jest.fn(), findOne: jest.fn(), save: jest.fn() }
  const dataSource = {
    getRepository: jest.fn(),
    transaction: jest.fn(async (cb: (e: typeof etm) => unknown) => cb(etm)),
  }
  const monsterService = {
    lockAndTickLatest: jest.fn(),
    saveState: jest.fn(),
    saveEvents: jest.fn(),
  }
  const walletService = { getBalance: jest.fn(), change: jest.fn() }
  const inventoryService = { add: jest.fn() }
  const monster = { id: 'm1', skillLoadout: null }
  const saved = { id: 'saved' }
  const outcome = { state: { s: 1 }, events: [{ e: 1 }] }
  const stage = { boss: false, skills: ['sk1', 'sk2'] }
  const enemy = {
    name: 'e',
    emoji: '🐛',
    element: 'leaf',
    hp: 10,
    atk: 2,
    def: 3,
    spd: 4,
    eva: 5,
    acc: 6,
    res: 7,
  }
  let service: AdventureService
  // Drop-roll value (0..9999) and the generic roll for every other randomInt call.
  let dropRoll = 9999

  const arenaResult = (winner: number) => m(simulateArena).mockReturnValue({ winner, ticks: 250 })

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers().setSystemTime(NOW)
    dropRoll = 9999
    m(randomInt).mockImplementation((_min: number, max: number) => (max === 10_000 ? dropRoll : 7))
    m(findArenaStage).mockReturnValue(stage)
    m(arenaEnemyOf).mockReturnValue(enemy)
    m(toArenaFighter).mockReturnValue({
      name: 'p',
      emoji: '🐣',
      element: 'tide',
    })
    m(loadSpecialBonus).mockResolvedValue({ staminaCostMultiplier: 1, dropMultiplier: 1 })
    m(applyBattleOutcome).mockReturnValue(outcome)
    m(applyAdventureSkip).mockReturnValue(outcome)
    monsterService.lockAndTickLatest.mockResolvedValue(monster)
    monsterService.saveState.mockResolvedValue(saved)
    walletService.getBalance.mockResolvedValue({ coin: 1 })
    walletService.change.mockImplementation(async (_u, cur) => ({ last: cur }))
    etm.find.mockResolvedValue([])
    etm.findOne.mockResolvedValue(null)
    service = new AdventureService(
      dataSource as never,
      monsterService as never,
      walletService as never,
      inventoryService as never
    )
  })
  afterEach(() => jest.useRealTimers())

  describe('getAdventure', () => {
    it('lists areas with unlock state, clear counts and enemy views', async () => {
      dataSource.getRepository.mockReturnValue({
        find: jest.fn().mockResolvedValue([{ stageId: 'meadow_1', clearCount: 4 }]),
      })
      m(findArenaStage).mockImplementation((id: string) => (id === 'meadow_2' ? undefined : stage))
      const res = await service.getAdventure('u1')
      expect(res.areas).toHaveLength(5)
      const [s1, s2, s3, boss] = res.areas[0].stages
      expect(s1).toMatchObject({ id: 'meadow_1', clearCount: 4, unlocked: true, reward: 10 })
      expect(s1.firstClearReward).toBe(20)
      expect(s1.enemy).toMatchObject({
        name: 'e',
        isBoss: false,
        stats: { hp: expect.any(Number), atk: 2, def: 3, spd: 4 },
        skills: [{ id: 'sk1' }, { id: 'sk2' }],
      })
      expect(s2).toMatchObject({ enemy: null, clearCount: 0, unlocked: true })
      expect(s3.unlocked).toBe(false)
      expect(boss.firstClearGems).toBe(5)
    })
  })

  describe('battle', () => {
    it('rejects an unknown stage before opening a transaction', async () => {
      await expect(service.battle('u1', 'nope')).rejects.toThrow(
        new NotFoundException('Stage not found')
      )
      expect(dataSource.transaction).not.toHaveBeenCalled()
    })

    it('rejects a user without a monster', async () => {
      monsterService.lockAndTickLatest.mockResolvedValue(null)
      await expect(service.battle('u1', 'meadow_1')).rejects.toThrow(
        'You do not have a monster yet'
      )
    })

    it('rejects a locked stage', async () => {
      await expect(service.battle('u1', 'meadow_2')).rejects.toThrow(
        new BadRequestException('Stage is locked')
      )
    })

    it('rejects when the arena has no stage for it', async () => {
      m(findArenaStage).mockReturnValue(undefined)
      await expect(service.battle('u1', 'meadow_1')).rejects.toThrow(
        new NotFoundException('Stage not found')
      )
    })

    it('pays first-clear coins, gems, a drop and essence on a first boss win', async () => {
      etm.find.mockResolvedValue([
        { stageId: 'meadow_1' },
        { stageId: 'meadow_2' },
        { stageId: 'meadow_3' },
      ])
      arenaResult(0)
      dropRoll = 0
      m(grantEquipment).mockResolvedValue({ id: 'g1' })
      m(rollAdventureEssence).mockReturnValueOnce({ itemId: 'ess', qty: 2 })
      const res = await service.battle('u1', 'meadow_boss')

      expect(assertCanAdventure).toHaveBeenCalledWith(monster, 10)
      expect(applyBattleOutcome).toHaveBeenCalledWith(
        monster,
        true,
        { stageId: 'meadow_boss', seed: 7, rounds: 13, reward: 80, gemReward: 5 },
        NOW,
        10
      )
      expect(monsterService.saveEvents).toHaveBeenCalledWith(saved, outcome.events, etm)
      expect(etm.save).toHaveBeenCalledWith(expect.anything(), {
        userId: 'u1',
        stageId: 'meadow_boss',
        clearCount: 1,
        firstClearedAt: NOW,
      })
      expect(walletService.change).toHaveBeenNthCalledWith(
        1,
        'u1',
        EnumWalletCurrency.COIN,
        80,
        EnumWalletTransactionReason.BATTLE_REWARD,
        'meadow_boss',
        etm
      )
      expect(walletService.change).toHaveBeenNthCalledWith(
        2,
        'u1',
        EnumWalletCurrency.GEM,
        5,
        EnumWalletTransactionReason.BOSS_FIRST_CLEAR,
        'meadow_boss',
        etm
      )
      expect(inventoryService.add).toHaveBeenCalledWith('u1', 'ess', etm, 2)
      expect(res.wallet).toEqual({ last: EnumWalletCurrency.GEM })
      expect(res.battle).toMatchObject({
        kind: 'arena',
        won: true,
        isFirstClear: true,
        reward: 80,
        gemReward: 5,
        rounds: 13,
        replay: 'replay',
        drop: { view: 'g1' },
        dropBagFull: false,
        essence: [{ itemId: 'ess', qty: 2 }],
        player: { name: 'p', emoji: '🐣', element: 'tide' },
      })
    })

    it('pays a plain repeat win and bumps the clear count (no gems, no drop)', async () => {
      const existing = { stageId: 'meadow_1', clearCount: 2 }
      etm.find.mockResolvedValue([existing])
      arenaResult(0)
      const res = await service.battle('u1', 'meadow_1')
      expect(existing.clearCount).toBe(3)
      expect(etm.save).toHaveBeenCalledWith(expect.anything(), existing)
      expect(walletService.change).toHaveBeenCalledTimes(1)
      expect(res.battle).toMatchObject({
        reward: 10,
        isFirstClear: false,
        gemReward: 0,
        drop: null,
      })
    })

    it('does not pay gems for a first clear of a non-boss stage', async () => {
      arenaResult(0)
      const res = await service.battle('u1', 'meadow_1')
      expect(res.battle).toMatchObject({ isFirstClear: true, reward: 20, gemReward: 0 })
      expect(walletService.change).toHaveBeenCalledTimes(1)
    })

    it('reports a lost piece when the bag is full', async () => {
      arenaResult(0)
      dropRoll = 0
      m(grantEquipment).mockResolvedValue(null)
      const res = await service.battle('u1', 'meadow_1')
      expect(res.battle).toMatchObject({ drop: null, dropBagFull: true })
    })

    it('rolls no drop for an area without grade rates', async () => {
      etm.find.mockResolvedValue(
        ['meadow_1', 'meadow_2', 'meadow_3', 'meadow_boss'].map(stageId => ({ stageId }))
      )
      arenaResult(0)
      const res = await service.battle('u1', 'coast_1')
      expect(grantEquipment).not.toHaveBeenCalled()
      expect(res.battle.dropBagFull).toBe(false)
    })

    it('pays nothing on a loss and reads the wallet balance', async () => {
      arenaResult(1)
      const res = await service.battle('u1', 'meadow_1')
      expect(applyBattleOutcome).toHaveBeenCalledWith(
        monster,
        false,
        expect.objectContaining({ reward: 0, gemReward: 0 }),
        NOW,
        10
      )
      expect(walletService.change).not.toHaveBeenCalled()
      expect(etm.save).not.toHaveBeenCalled()
      expect(res.wallet).toEqual({ coin: 1 })
      expect(res.battle).toMatchObject({ won: false, reward: 0, drop: null, essence: [] })
    })

    it('scales stamina cost with the special bonus, never below 1', async () => {
      m(loadSpecialBonus).mockResolvedValue({ staminaCostMultiplier: 0, dropMultiplier: 1 })
      arenaResult(1)
      await service.battle('u1', 'meadow_1')
      expect(assertCanAdventure).toHaveBeenCalledWith(monster, 1)
    })
  })

  describe('skip', () => {
    it('rejects an unknown stage', async () => {
      await expect(service.skip('u1', 'nope', 2)).rejects.toThrow('Stage not found')
    })

    it('rejects a user without a monster', async () => {
      monsterService.lockAndTickLatest.mockResolvedValue(null)
      await expect(service.skip('u1', 'meadow_1', 2)).rejects.toThrow(
        'You do not have a monster yet'
      )
    })

    it('rejects a stage that was never cleared', async () => {
      await expect(service.skip('u1', 'meadow_1', 2)).rejects.toThrow(
        'Clear this stage once before skipping it'
      )
    })

    it('pays coins per run, rolls drops and sums essence', async () => {
      const existing = { stageId: 'meadow_1', clearCount: 1 }
      etm.findOne.mockResolvedValue(existing)
      dropRoll = 0
      m(grantEquipment)
        .mockResolvedValueOnce({ id: 'g1' })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'g3' })
      m(rollAdventureEssence)
        .mockReturnValueOnce({ itemId: 'ess', qty: 2 })
        .mockReturnValueOnce(null)
        .mockReturnValueOnce({ itemId: 'ess', qty: 1 })
      const res = await service.skip('u1', 'meadow_1', 3)

      expect(applyAdventureSkip).toHaveBeenCalledWith(monster, 'meadow_1', 3, 10, NOW, 10)
      expect(existing.clearCount).toBe(4)
      expect(walletService.change).toHaveBeenCalledWith(
        'u1',
        EnumWalletCurrency.COIN,
        30,
        EnumWalletTransactionReason.ADVENTURE_SKIP_REWARD,
        'meadow_1',
        etm
      )
      expect(inventoryService.add).toHaveBeenCalledWith('u1', 'ess', etm, 3)
      expect(res.skip).toEqual({
        stageId: 'meadow_1',
        runs: 3,
        coins: 30,
        drops: [{ view: 'g1' }, { view: 'g3' }],
        dropsLost: 1,
        essence: [{ itemId: 'ess', qty: 3 }],
      })
      expect(res.monster).toEqual({ view: saved })
    })

    it('feeds the essence roll a 0..1 random source', async () => {
      etm.findOne.mockResolvedValue({ stageId: 'meadow_1', clearCount: 1 })
      m(randomInt).mockImplementation((_min: number, max: number) =>
        max === 10_000 ? dropRoll : 500_000
      )
      const rands: number[] = []
      m(rollAdventureEssence).mockImplementationOnce((_area: string, rand: () => number) => {
        rands.push(rand())
        return null
      })
      await service.skip('u1', 'meadow_1', 1)
      expect(rands).toEqual([0.5])
      expect(randomInt).toHaveBeenCalledWith(0, 1_000_000)
    })

    it('skips drops that miss the chance roll', async () => {
      etm.findOne.mockResolvedValue({ stageId: 'meadow_1', clearCount: 1 })
      const res = await service.skip('u1', 'meadow_1', 2)
      expect(grantEquipment).not.toHaveBeenCalled()
      expect(res.skip.drops).toEqual([])
    })
  })
})
