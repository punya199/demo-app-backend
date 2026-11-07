/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- jest mock fakes */
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { randomInt } from 'crypto'
import { EnumMonsterStage } from '../../../db/entities/monster.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../../db/entities/wallet-transaction.entity'
import { claimExpedition, startExpedition } from '../core/monster-engine'
import { ExpeditionService } from './expedition.service'
import { EXPEDITION_DROP_ITEMS, getExpeditionRate } from './idle-data'
import { ADVENTURE_AREAS } from './adventure-data'

jest.mock('crypto', () => ({ ...jest.requireActual('crypto'), randomInt: jest.fn() }))
jest.mock('../battle/battle-stats', () => ({
  toFighter: jest.fn(() => ({ stats: { hp: 100, atk: 20, def: 20, spd: 20 } })),
}))
jest.mock('../equipment/equipment.service', () => ({
  loadEquipmentBonus: jest.fn(async () => undefined),
}))
jest.mock('../passive/passive.service', () => ({
  loadPassiveBonus: jest.fn(async () => ({ expeditionCoinMultiplier: 2 })),
}))
jest.mock('../core/monster-engine', () => ({
  claimExpedition: jest.fn(),
  startExpedition: jest.fn(),
}))
jest.mock('../core/monster.service', () => ({
  MonsterService: class {},
  toMonsterView: jest.fn((m: unknown) => ({ view: m })),
  withRuleErrors: (fn: () => unknown) => fn(),
}))

const NOW = new Date('2026-05-01T05:00:00Z')
// stats must match the toFighter mock above
const FIGHTER_STATS = { hp: 100, atk: 20, def: 20, spd: 20 }

describe('ExpeditionService', () => {
  const etm = { find: jest.fn() }
  const dataSource = {
    manager: etm,
    transaction: jest.fn(async (cb: (e: typeof etm) => unknown) => cb(etm)),
  }
  const monsterService = {
    lockAndTickLatest: jest.fn(),
    saveState: jest.fn(),
    saveEvents: jest.fn(),
  }
  const inventoryService = { add: jest.fn() }
  const walletService = { getBalance: jest.fn(), change: jest.fn() }
  const saved = { id: 'saved' }
  const result = { state: { s: 1 }, events: [{ e: 1 }] }
  const monster = { id: 'm1', diedAt: null, stage: EnumMonsterStage.ADULT }
  let service: ExpeditionService

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers().setSystemTime(NOW)
    monsterService.lockAndTickLatest.mockResolvedValue(monster)
    monsterService.saveState.mockResolvedValue(saved)
    walletService.getBalance.mockResolvedValue({ coin: 1 })
    walletService.change.mockResolvedValue({ coin: 999 })
    ;(startExpedition as jest.Mock).mockReturnValue(result)
    ;(claimExpedition as jest.Mock).mockReturnValue(result)
    etm.find.mockResolvedValue([])
    service = new ExpeditionService(
      dataSource as never,
      monsterService as never,
      inventoryService as never,
      walletService as never
    )
  })
  afterEach(() => jest.useRealTimers())

  describe('getExpedition', () => {
    it('lists areas with unlock state and the monster rate (passive multiplier applied)', async () => {
      etm.find.mockResolvedValue([{ stageId: 'meadow_boss' }])
      const res = await service.getExpedition('u1')
      expect(res.maxMinutes).toEqual(expect.any(Number))
      expect(res.areas.map(a => a.id)).toEqual(ADVENTURE_AREAS.map(a => a.id))
      const [meadow, coast, volcano] = res.areas
      expect(meadow).toMatchObject({ unlocked: true, baseRatePerHour: 100 })
      expect(meadow.ratePerHour).toBe(getExpeditionRate(ADVENTURE_AREAS[0], FIGHTER_STATS) * 2)
      expect(coast.unlocked).toBe(true)
      expect(volcano.unlocked).toBe(false)
    })

    it.each([
      ['no monster', null],
      ['a dead monster', { ...monster, diedAt: NOW }],
      ['an egg', { ...monster, stage: EnumMonsterStage.EGG }],
    ])('gives a null rate for %s', async (_name, row) => {
      monsterService.lockAndTickLatest.mockResolvedValue(row)
      const res = await service.getExpedition('u1')
      expect(res.areas.every(a => a.ratePerHour === null)).toBe(true)
    })
  })

  describe('getUnlockedAreaIds', () => {
    it('reads progress from the default manager when none is passed', async () => {
      etm.find.mockResolvedValue([{ stageId: 'meadow_boss' }])
      const ids = await (
        service as unknown as { getUnlockedAreaIds(u: string): Promise<string[]> }
      ).getUnlockedAreaIds('u1')
      expect(ids).toEqual(['meadow', 'coast'])
    })
  })

  describe('start', () => {
    it('rejects an unknown area', async () => {
      await expect(service.start('u1', 'nope')).rejects.toThrow(
        new NotFoundException('Area not found')
      )
    })

    it('rejects a user without a monster', async () => {
      monsterService.lockAndTickLatest.mockResolvedValue(null)
      await expect(service.start('u1', 'meadow')).rejects.toThrow('You do not have a monster yet')
    })

    it('rejects a locked area', async () => {
      await expect(service.start('u1', 'coast')).rejects.toThrow(
        new BadRequestException('Area is locked')
      )
    })

    it('departs with the rate fixed from stats and passives', async () => {
      const res = await service.start('u1', 'meadow')
      expect(startExpedition).toHaveBeenCalledWith(
        monster,
        'meadow',
        getExpeditionRate(ADVENTURE_AREAS[0], FIGHTER_STATS) * 2,
        NOW
      )
      expect(monsterService.saveState).toHaveBeenCalledWith(monster, result.state, etm)
      expect(monsterService.saveEvents).toHaveBeenCalledWith(saved, result.events, etm)
      expect(res).toEqual({ monster: { view: saved } })
    })
  })

  describe('claim', () => {
    it('rejects a user without a monster', async () => {
      monsterService.lockAndTickLatest.mockResolvedValue(null)
      await expect(service.claim('u1')).rejects.toThrow('You do not have a monster yet')
    })

    it('pays coins and banks counted drops', async () => {
      const trip = {
        ...monster,
        expeditionMinutes: 480,
        expeditionRate: 60,
        expeditionAreaId: 'meadow',
      }
      monsterService.lockAndTickLatest.mockResolvedValue(trip)
      ;(randomInt as jest.Mock).mockReturnValue(0)
      const res = await service.claim('u1')
      const items = [EXPEDITION_DROP_ITEMS[0], EXPEDITION_DROP_ITEMS[0]]
      expect(randomInt).toHaveBeenCalledWith(0, EXPEDITION_DROP_ITEMS.length)
      expect(claimExpedition).toHaveBeenCalledWith(trip, { coins: 480, items }, NOW)
      expect(walletService.change).toHaveBeenCalledWith(
        'u1',
        EnumWalletCurrency.COIN,
        480,
        EnumWalletTransactionReason.EXPEDITION_REWARD,
        'meadow',
        etm
      )
      expect(inventoryService.add).toHaveBeenCalledTimes(1)
      expect(inventoryService.add).toHaveBeenCalledWith('u1', EXPEDITION_DROP_ITEMS[0], etm, 2)
      expect(res).toEqual({
        monster: { view: saved },
        wallet: { coin: 999 },
        summary: { areaId: 'meadow', minutes: 480, coins: 480, items },
      })
    })

    it('counts different drops separately', async () => {
      monsterService.lockAndTickLatest.mockResolvedValue({
        ...monster,
        expeditionMinutes: 480,
        expeditionRate: 60,
      })
      ;(randomInt as jest.Mock).mockReturnValueOnce(0).mockReturnValueOnce(1)
      await service.claim('u1')
      expect(inventoryService.add).toHaveBeenCalledWith('u1', EXPEDITION_DROP_ITEMS[0], etm, 1)
      expect(inventoryService.add).toHaveBeenCalledWith('u1', EXPEDITION_DROP_ITEMS[1], etm, 1)
    })

    it('skips the payout when nothing was gathered', async () => {
      monsterService.lockAndTickLatest.mockResolvedValue({
        ...monster,
        expeditionMinutes: 0,
        expeditionRate: 60,
      })
      const res = await service.claim('u1')
      expect(walletService.change).not.toHaveBeenCalled()
      expect(inventoryService.add).not.toHaveBeenCalled()
      expect(res.wallet).toEqual({ coin: 1 })
      expect(res.summary.items).toEqual([])
    })
  })
})
