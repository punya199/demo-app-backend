/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await -- jest mock fakes */
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { EnumMonsterLogType } from '../../../db/entities/monster-log.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../../db/entities/wallet-transaction.entity'
import { IMonsterEvent } from '../core/monster-engine'
import {
  DAILY_QUESTS,
  EnumQuestId,
  LOGIN_QUEST_ID,
  LOGIN_REWARDS,
  WEEKLY_QUESTS,
} from './quest-data'
import { QuestService, recordQuestProgress } from './quest.service'

// 2026-05-01 12:00 Thai time, ISO week 2026-W18.
const NOW = new Date('2026-05-01T05:00:00Z')
const TODAY = '2026-05-01'
const WEEK = '2026-W18'

const action = (name: string): IMonsterEvent => ({
  type: EnumMonsterLogType.ACTION,
  at: NOW,
  payload: { action: name },
})

describe('recordQuestProgress', () => {
  it('upserts one capped row per daily and weekly quest the events move', async () => {
    const etm = { query: jest.fn() }
    await recordQuestProgress(
      'u1',
      NOW,
      [
        action('feed'),
        action('feed'),
        { type: EnumMonsterLogType.BATTLE, at: NOW, payload: { won: true } },
      ],
      etm as never
    )
    const params = etm.query.mock.calls.map(([, p]) => p)
    expect(params).toEqual([
      ['u1', TODAY, EnumQuestId.FEED, 2, 3],
      ['u1', TODAY, EnumQuestId.BATTLE_WIN, 1, 2],
      ['u1', WEEK, EnumQuestId.WEEKLY_BATTLE_WIN, 1, 15],
      ['u1', WEEK, EnumQuestId.WEEKLY_FEED, 2, 14],
    ])
    expect(etm.query.mock.calls[0][0]).toContain('LEAST')
  })

  it('writes nothing for events that move no quest', async () => {
    const etm = { query: jest.fn() }
    await recordQuestProgress('u1', NOW, [action('medicine')], etm as never)
    expect(etm.query).not.toHaveBeenCalled()
  })
})

describe('QuestService', () => {
  const qb = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn(),
  }
  const etm = { find: jest.fn(), query: jest.fn(), createQueryBuilder: jest.fn(() => qb) }
  const dataSource = {
    manager: etm,
    transaction: jest.fn(async (cb: (e: typeof etm) => unknown) => cb(etm)),
  }
  const walletService = { change: jest.fn() }
  let service: QuestService
  // Rows returned by the two getQuests lookups: [quest rows, login rows].
  let questRows: unknown[]
  let loginRows: unknown[]

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers().setSystemTime(NOW)
    questRows = []
    loginRows = []
    etm.find.mockImplementation(async (_entity, opts) =>
      opts.where.questId === LOGIN_QUEST_ID ? loginRows : questRows
    )
    walletService.change.mockImplementation(async (_u, currency) => ({ last: currency }))
    service = new QuestService(dataSource as never, walletService as never)
  })
  afterEach(() => jest.useRealTimers())

  describe('getQuests', () => {
    it('merges progress and claimed flags into both quest sets', async () => {
      questRows = [
        { questId: EnumQuestId.FEED, progress: 2, claimedAt: null },
        { questId: EnumQuestId.TRAIN, progress: 3, claimedAt: NOW },
        { questId: EnumQuestId.WEEKLY_FEED, progress: 9, claimedAt: null },
      ]
      loginRows = [{ questDate: TODAY }]
      const res = await service.getQuests('u1')

      expect(res.date).toBe(TODAY)
      expect(res.resetsAt).toEqual(new Date('2026-05-01T17:00:00Z'))
      expect(res.quests).toHaveLength(DAILY_QUESTS.length)
      expect(res.quests.find(q => q.id === EnumQuestId.FEED)).toMatchObject({
        progress: 2,
        claimed: false,
      })
      expect(res.quests.find(q => q.id === EnumQuestId.TRAIN)).toMatchObject({
        progress: 3,
        claimed: true,
      })
      expect(res.quests.find(q => q.id === EnumQuestId.CLEAN)).toMatchObject({
        progress: 0,
        claimed: false,
      })
      expect(res.weekly.week).toBe(WEEK)
      expect(res.weekly.resetsAt).toEqual(new Date('2026-05-03T17:00:00Z'))
      expect(res.weekly.quests).toHaveLength(WEEKLY_QUESTS.length)
      expect(res.weekly.quests.find(q => q.id === EnumQuestId.WEEKLY_FEED)?.progress).toBe(9)
      expect(res.login).toMatchObject({ claimedToday: true, streak: 1, day: 1 })
      expect(res.login.rewards).toBe(LOGIN_REWARDS)
    })
  })

  describe('claim', () => {
    it('rejects an unknown quest', async () => {
      await expect(service.claim('u1', 'nope')).rejects.toThrow(
        new NotFoundException('Quest not found')
      )
      expect(dataSource.transaction).not.toHaveBeenCalled()
    })

    it('rejects an incomplete or already claimed quest', async () => {
      qb.execute.mockResolvedValue({ affected: 0 })
      await expect(service.claim('u1', EnumQuestId.FEED)).rejects.toThrow(
        new BadRequestException('Quest is not complete or was already claimed')
      )
      expect(walletService.change).not.toHaveBeenCalled()
    })

    it('pays a daily quest in coins only when it has no gem reward', async () => {
      qb.execute.mockResolvedValue({ affected: 1 })
      const res = await service.claim('u1', EnumQuestId.FEED)
      expect(qb.set).toHaveBeenCalledWith({ claimedAt: NOW })
      expect(qb.where).toHaveBeenCalledWith(expect.any(String), {
        userId: 'u1',
        questDate: TODAY,
        questId: EnumQuestId.FEED,
      })
      expect(qb.andWhere).toHaveBeenCalledWith(expect.any(String), { target: 3 })
      expect(walletService.change).toHaveBeenCalledTimes(1)
      expect(walletService.change).toHaveBeenCalledWith(
        'u1',
        EnumWalletCurrency.COIN,
        10,
        EnumWalletTransactionReason.DAILY_QUEST,
        EnumQuestId.FEED,
        etm
      )
      expect(res).toMatchObject({ wallet: { last: EnumWalletCurrency.COIN }, date: TODAY })
    })

    it('pays a weekly quest in coins and gems under the weekly reason', async () => {
      qb.execute.mockResolvedValue({ affected: 1 })
      const res = await service.claim('u1', EnumQuestId.WEEKLY_BATTLE_WIN)
      expect(qb.where.mock.calls[0][1].questDate).toBe(WEEK)
      expect(walletService.change).toHaveBeenNthCalledWith(
        1,
        'u1',
        EnumWalletCurrency.COIN,
        300,
        EnumWalletTransactionReason.WEEKLY_QUEST,
        EnumQuestId.WEEKLY_BATTLE_WIN,
        etm
      )
      expect(walletService.change).toHaveBeenNthCalledWith(
        2,
        'u1',
        EnumWalletCurrency.GEM,
        5,
        EnumWalletTransactionReason.WEEKLY_QUEST,
        EnumQuestId.WEEKLY_BATTLE_WIN,
        etm
      )
      expect(res.wallet).toEqual({ last: EnumWalletCurrency.GEM })
    })
  })

  describe('claimLogin', () => {
    it('rejects a second claim on the same day', async () => {
      etm.query.mockResolvedValue([])
      await expect(service.claimLogin('u1')).rejects.toThrow(
        new BadRequestException('Login reward was already claimed today')
      )
      expect(walletService.change).not.toHaveBeenCalled()
    })

    it('pays day 1 in coins only', async () => {
      etm.query.mockResolvedValue([{ id: 'row' }])
      const res = await service.claimLogin('u1')
      expect(etm.query.mock.calls[0][1]).toEqual(['u1', TODAY, LOGIN_QUEST_ID, NOW])
      expect(walletService.change).toHaveBeenCalledTimes(1)
      expect(walletService.change).toHaveBeenCalledWith(
        'u1',
        EnumWalletCurrency.COIN,
        50,
        EnumWalletTransactionReason.LOGIN_REWARD,
        TODAY,
        etm
      )
      expect(res.wallet).toEqual({ last: EnumWalletCurrency.COIN })
    })

    it('pays coins and a gem on the third day of a streak', async () => {
      loginRows = [{ questDate: '2026-04-30' }, { questDate: '2026-04-29' }]
      etm.query.mockResolvedValue([{ id: 'row' }])
      const res = await service.claimLogin('u1')
      expect(walletService.change).toHaveBeenNthCalledWith(
        1,
        'u1',
        EnumWalletCurrency.COIN,
        60,
        EnumWalletTransactionReason.LOGIN_REWARD,
        TODAY,
        etm
      )
      expect(walletService.change).toHaveBeenNthCalledWith(
        2,
        'u1',
        EnumWalletCurrency.GEM,
        1,
        EnumWalletTransactionReason.LOGIN_REWARD,
        TODAY,
        etm
      )
      expect(res.wallet).toEqual({ last: EnumWalletCurrency.GEM })
    })
  })
})
