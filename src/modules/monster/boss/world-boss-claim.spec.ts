/* eslint-disable @typescript-eslint/no-unsafe-return -- jest mock fakes */
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { WorldBossDamageEntity } from '../../../db/entities/world-boss-damage.entity'
import { WorldBossEntity } from '../../../db/entities/world-boss.entity'
import { CRAFT_CATALYST_ID } from '../equipment/craft-materials'
import { grantItem, isEquipmentBagFull, toEquipmentView } from '../equipment/equipment.service'
import {
  makeDataSource,
  makeInventory,
  makeManager,
  makeMonsterService,
  makeWallet,
  NOW,
} from './boss-test-helpers'
import { bossTokenItemId } from './raid-data'
import { getWeek, WORLD_BOSS_ROTATION } from './world-boss-data'
import { rankOf } from './world-boss-queries'
import { WorldBossService } from './world-boss.service'

jest.mock('../equipment/equipment.service', () => ({
  grantItem: jest.fn(),
  isEquipmentBagFull: jest.fn(),
  loadEquipmentBonus: jest.fn(),
  rand: jest.fn(),
  toEquipmentView: jest.fn(),
}))
jest.mock('./world-boss-queries', () => ({
  ...jest.requireActual('./world-boss-queries'),
  rankOf: jest.fn(),
}))

const DEF = WORLD_BOSS_ROTATION[0]
const WEEK = '2026-W08'
const ENDED = new Date('2026-03-01T00:00:00Z')

const setup = () => {
  const etm = makeManager()
  const inventory = makeInventory()
  const wallet = makeWallet()
  const update = {
    set: jest.fn(),
    where: jest.fn(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
    update: jest.fn(),
  }
  update.update.mockReturnValue(update)
  update.set.mockReturnValue(update)
  update.where.mockReturnValue(update)
  etm.createQueryBuilder.mockReturnValue(update)
  const service = new WorldBossService(
    makeDataSource(etm) as never,
    makeMonsterService() as never,
    inventory as never,
    wallet as never
  )
  return { etm, inventory, wallet, update, service }
}

const endedBoss = (over: Record<string, unknown> = {}) => ({
  id: 'wb-1',
  week: WEEK,
  bossId: DEF.id,
  endsAt: ENDED,
  defeatedAt: null,
  killedByUserId: null,
  ...over,
})

beforeEach(() => {
  jest.resetAllMocks()
  jest.useFakeTimers().setSystemTime(NOW)
  ;(isEquipmentBagFull as jest.Mock).mockResolvedValue(false)
  ;(grantItem as jest.Mock).mockResolvedValue({ id: 'piece-1' })
  ;(toEquipmentView as jest.Mock).mockImplementation((row: { id: string }) => ({ view: row.id }))
  ;(rankOf as jest.Mock).mockResolvedValue(50)
})
afterEach(() => jest.useRealTimers())

describe('WorldBossService.claim guards', () => {
  it('does not know a week that never ran', async () => {
    const { service, etm } = setup()
    await expect(service.claim('user-1', WEEK)).rejects.toThrow(
      new NotFoundException('World boss week not found')
    )
    expect(etm.findOne).toHaveBeenCalledWith(WorldBossEntity, { where: { week: WEEK } })
  })

  it('does not pay before the week is over', async () => {
    const { service, etm } = setup()
    etm.findOne.mockResolvedValue(endedBoss({ endsAt: getWeek(NOW).endsAt }))
    await expect(service.claim('user-1', WEEK)).rejects.toThrow(
      new BadRequestException('World boss has not ended yet')
    )
  })

  it.each([
    ['no damage row', null],
    ['reward already claimed', { rewardClaimedAt: ENDED }],
  ])('has nothing to claim with %s', async (_name, row) => {
    const { service, etm } = setup()
    etm.findOne.mockResolvedValueOnce(endedBoss()).mockResolvedValueOnce(row)
    await expect(service.claim('user-1', WEEK)).rejects.toThrow(
      new BadRequestException('No world boss reward to claim')
    )
    expect(etm.findOne).toHaveBeenLastCalledWith(WorldBossDamageEntity, {
      where: { worldBossId: 'wb-1', userId: 'user-1' },
      lock: { mode: 'pessimistic_write' },
    })
  })

  it('refuses a full bag when a piece is won, before marking the claim', async () => {
    const { service, etm, update } = setup()
    etm.findOne
      .mockResolvedValueOnce(endedBoss({ defeatedAt: ENDED, killedByUserId: 'user-1' }))
      .mockResolvedValueOnce({ id: 'row-1', damage: 5, hits: 1, rewardClaimedAt: null })
    ;(isEquipmentBagFull as jest.Mock).mockResolvedValue(true)
    await expect(service.claim('user-1', WEEK)).rejects.toThrow(
      new BadRequestException('Equipment bag is full')
    )
    expect(update.execute).not.toHaveBeenCalled()
  })

  it('loses a claim race: the guarded update touches no row', async () => {
    const { service, etm, update, wallet } = setup()
    etm.findOne
      .mockResolvedValueOnce(endedBoss())
      .mockResolvedValueOnce({ id: 'row-1', damage: 5, hits: 1, rewardClaimedAt: null })
    update.execute.mockResolvedValue({ affected: 0 })
    await expect(service.claim('user-1', WEEK)).rejects.toThrow(
      new BadRequestException('No world boss reward to claim')
    )
    expect(wallet.change).not.toHaveBeenCalled()
  })
})

describe('WorldBossService.claim payout', () => {
  const rowOf = (hits: number) => ({ id: 'row-1', damage: 5, hits, rewardClaimedAt: null })

  it('pays participation without a piece for a low rank', async () => {
    const { service, etm, inventory, wallet, update } = setup()
    etm.findOne.mockResolvedValueOnce(endedBoss()).mockResolvedValueOnce(rowOf(3))

    const result = await service.claim('user-1', WEEK)

    expect(update.set).toHaveBeenCalledWith({ rewardClaimedAt: NOW })
    expect(update.where).toHaveBeenCalledWith('id = :id AND reward_claimed_at IS NULL', {
      id: 'row-1',
    })
    expect(isEquipmentBagFull).not.toHaveBeenCalled()
    expect(wallet.change).toHaveBeenNthCalledWith(
      1,
      'user-1',
      'coin',
      result.reward.coin,
      'world_boss_reward',
      WEEK,
      etm
    )
    expect(wallet.change).toHaveBeenNthCalledWith(
      2,
      'user-1',
      'raid_token',
      result.reward.raidToken,
      'world_boss_reward',
      WEEK,
      etm
    )
    expect(inventory.add).toHaveBeenCalledWith(
      'user-1',
      bossTokenItemId(DEF.id),
      etm,
      result.reward.bossToken
    )
    expect(result.craftDrops.map(drop => drop.itemId)).toContain(CRAFT_CATALYST_ID)
    for (const drop of result.craftDrops) {
      expect(inventory.add).toHaveBeenCalledWith('user-1', drop.itemId, etm, drop.qty)
    }
    expect(grantItem).not.toHaveBeenCalled()
    expect(result).toMatchObject({ week: WEEK, rank: 50, drop: null, wallet: { coin: 2 } })
    expect(result.reward.coin).toBe(150)
  })

  it('gives the killing blow a piece and stones, and pays the top rank more', async () => {
    const { service, etm, inventory } = setup()
    etm.findOne
      .mockResolvedValueOnce(endedBoss({ defeatedAt: ENDED, killedByUserId: 'user-1' }))
      .mockResolvedValueOnce(rowOf(2))
    ;(rankOf as jest.Mock).mockResolvedValue(1)

    const result = await service.claim('user-1', WEEK)

    expect(isEquipmentBagFull).toHaveBeenCalledWith('user-1', etm)
    expect(result.reward.pieceGrade).not.toBeNull()
    expect(grantItem).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ grade: result.reward.pieceGrade }),
      `world_boss:${WEEK}`,
      etm
    )
    expect(result.drop).toEqual({ view: 'piece-1' })
    const stones = Object.entries(result.reward.refineStones)
    expect(stones.length).toBeGreaterThan(0)
    for (const [materialId, quantity] of stones) {
      expect(inventory.add).toHaveBeenCalledWith('user-1', materialId, etm, quantity)
    }
  })

  it('still succeeds, with no drop, when the piece cannot be granted', async () => {
    const { service, etm } = setup()
    etm.findOne
      .mockResolvedValueOnce(endedBoss({ defeatedAt: ENDED, killedByUserId: 'user-1' }))
      .mockResolvedValueOnce(rowOf(1))
    ;(grantItem as jest.Mock).mockResolvedValue(null)
    const result = await service.claim('user-1', WEEK)
    expect(result.drop).toBeNull()
  })
})
