/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- jest mock fakes */
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { WorldBossDamageEntity } from '../../../db/entities/world-boss-damage.entity'
import { WorldBossEntity } from '../../../db/entities/world-boss.entity'
import { countFightsInWindow } from '../arena/daily-fights'
import { loadPublicCostumes } from '../equipment/costume.service'
import { isCraftSetId } from '../equipment/craft-sets'
import { EnumEquipmentGrade, EnumEquipmentSlot } from '../equipment/equipment-data'
import {
  grantItem,
  isEquipmentBagFull,
  rand,
  toEquipmentView,
} from '../equipment/equipment.service'
import { defaultDisplayName } from '../core/display-name'
import {
  makeDataSource,
  makeInventory,
  makeManager,
  makeMonsterService,
  makeWallet,
  NOW,
} from './boss-test-helpers'
import { bossTokenItemId, RAID_EXCHANGE_COST } from './raid-data'
import { findWorldBoss, getWeek, WORLD_BOSS_ROTATION } from './world-boss-data'
import { ensureCurrent, rankingRows, rankOf } from './world-boss-queries'
import { WorldBossService } from './world-boss.service'

jest.mock('../arena/daily-fights', () => ({
  ...jest.requireActual('../arena/daily-fights'),
  countFightsInWindow: jest.fn(),
}))
jest.mock('../equipment/costume.service', () => ({ loadPublicCostumes: jest.fn() }))
jest.mock('../equipment/craft-sets', () => ({
  ...jest.requireActual('../equipment/craft-sets'),
  isCraftSetId: jest.fn(),
}))
jest.mock('../equipment/equipment.service', () => ({
  grantItem: jest.fn(),
  isEquipmentBagFull: jest.fn(),
  loadEquipmentBonus: jest.fn(),
  rand: jest.fn(),
  toEquipmentView: jest.fn(),
}))
jest.mock('./world-boss-queries', () => ({
  ...jest.requireActual('./world-boss-queries'),
  ensureCurrent: jest.fn(),
  rankOf: jest.fn(),
  rankingRows: jest.fn(),
}))

const PLAIN = WORLD_BOSS_ROTATION.find(boss => !boss.shield && !boss.enrage)
const SHIELDED = WORLD_BOSS_ROTATION.find(boss => boss.shield && boss.enrage)!
const WEEK = getWeek(NOW)

const setup = () => {
  const etm = makeManager()
  const dataSource = makeDataSource(etm)
  const inventory = makeInventory()
  const service = new WorldBossService(
    dataSource as never,
    makeMonsterService() as never,
    inventory as never,
    makeWallet() as never
  )
  return { etm, dataSource, inventory, service }
}

const boss = (bossId: string, over: Record<string, unknown> = {}) => ({
  id: 'wb-1',
  week: WEEK.key,
  bossId,
  hp: 400,
  maxHp: 1000,
  endsAt: WEEK.endsAt,
  defeatedAt: null,
  killedByUserId: null,
  ...over,
})

beforeEach(() => {
  jest.resetAllMocks()
  jest.useFakeTimers().setSystemTime(NOW)
  ;(countFightsInWindow as jest.Mock).mockResolvedValue(1)
  ;(isCraftSetId as jest.Mock).mockReturnValue(false)
  ;(isEquipmentBagFull as jest.Mock).mockResolvedValue(false)
  ;(grantItem as jest.Mock).mockResolvedValue({ id: 'piece-1' })
  ;(toEquipmentView as jest.Mock).mockImplementation((row: { id: string }) => ({ view: row.id }))
  ;(rand as jest.Mock).mockReturnValue(0.5)
})
afterEach(() => jest.useRealTimers())

describe('WorldBossService.getStatus', () => {
  it('shows the boss, my damage and rank, and the rewards waiting from past weeks', async () => {
    const { service, etm } = setup()
    ;(ensureCurrent as jest.Mock).mockResolvedValue(boss(SHIELDED.id))
    const past = boss('retired_boss', { id: 'wb-0', week: '2026-W08', defeatedAt: NOW })
    etm.findOne.mockResolvedValue({ damage: 90, hits: 2 })
    etm.count.mockResolvedValue(12)
    etm.query.mockResolvedValue([{ week: '2026-W08', boss_id: 'retired_boss' }])
    etm.findOneOrFail.mockImplementation(async (entity: unknown) =>
      entity === WorldBossEntity ? past : { damage: 55, hits: 1 }
    )
    ;(rankOf as jest.Mock).mockResolvedValueOnce(4).mockResolvedValueOnce(2)

    const result = await service.getStatus('user-1')

    expect(etm.findOne).toHaveBeenCalledWith(WorldBossDamageEntity, {
      where: { worldBossId: 'wb-1', userId: 'user-1' },
    })
    expect(countFightsInWindow).toHaveBeenCalledWith(
      'user-1',
      'world_boss',
      expect.any(Number),
      NOW,
      etm
    )
    expect(etm.query).toHaveBeenCalledWith(expect.stringContaining('reward_claimed_at'), [
      'user-1',
      NOW,
    ])
    expect(result).toMatchObject({
      week: WEEK.key,
      participants: 12,
      myDamage: 90,
      myHits: 2,
      myRank: 2,
      hitsLeft: 2,
      boss: {
        id: SHIELDED.id,
        shield: SHIELDED.shield,
        enrage: SHIELDED.enrage,
        hp: 400,
        maxHp: 1000,
        isDefeated: false,
      },
    })
    expect(result.boss.setName).toBeTruthy()
    expect(result.boss.detail.stats.hp).toBe(400)
    expect(result.claimable).toHaveLength(1)
    expect(result.claimable[0]).toMatchObject({
      week: '2026-W08',
      bossName: 'retired_boss',
      rank: 4,
      defeated: true,
    })
    expect(result.claimable[0].reward.coin).toBeGreaterThan(0)
  })

  it('names a known past boss and handles a player who has not hit yet', async () => {
    const { service, etm } = setup()
    ;(countFightsInWindow as jest.Mock).mockResolvedValue(7)
    const known = WORLD_BOSS_ROTATION[0]
    ;(ensureCurrent as jest.Mock).mockResolvedValue(boss(PLAIN!.id, { defeatedAt: NOW }))
    etm.query.mockResolvedValue([{ week: '2026-W08', boss_id: known.id }])
    etm.findOneOrFail.mockImplementation(async (entity: unknown) =>
      entity === WorldBossEntity ? boss(known.id, { week: '2026-W08' }) : { damage: 1, hits: 1 }
    )
    ;(rankOf as jest.Mock).mockResolvedValue(9)

    const result = await service.getStatus('user-1')

    expect(result).toMatchObject({
      myDamage: 0,
      myHits: 0,
      myRank: null,
      hitsLeft: 0,
      boss: { shield: 0, enrage: null, isDefeated: true },
    })
    expect(result.claimable[0]).toMatchObject({ bossName: known.name, defeated: false })
    expect(rankOf).toHaveBeenCalledTimes(1)
  })
})

describe('WorldBossService.getRanking', () => {
  it('defaults to this week and shows names, costumes and which row is mine', async () => {
    const { service, dataSource } = setup()
    ;(rankingRows as jest.Mock).mockResolvedValue([
      { rank: 1, user_id: 'u1', damage: 9, hits: 3, display_name: 'Alice', emoji: 'e1' },
      { rank: 2, user_id: 'user-1', damage: 5, hits: 1, display_name: null, emoji: null },
    ])
    ;(loadPublicCostumes as jest.Mock).mockResolvedValue(new Map([['u1', { hat: 'x' }]]))

    const result = await service.getRanking('user-1')

    expect(rankingRows).toHaveBeenCalledWith(WEEK.key, dataSource)
    expect(loadPublicCostumes).toHaveBeenCalledWith(['u1', 'user-1'], dataSource.manager)
    expect(result).toEqual({
      week: WEEK.key,
      entries: [
        {
          costume: { hat: 'x' },
          rank: 1,
          displayName: 'Alice',
          emoji: 'e1',
          damage: 9,
          hits: 3,
          isMe: false,
        },
        {
          costume: null,
          rank: 2,
          displayName: defaultDisplayName('user-1'),
          emoji: null,
          damage: 5,
          hits: 1,
          isMe: true,
        },
      ],
    })
    expect(JSON.stringify(result)).not.toContain('"user_id"')
  })

  it('uses the requested week', async () => {
    const { service } = setup()
    ;(rankingRows as jest.Mock).mockResolvedValue([])
    ;(loadPublicCostumes as jest.Mock).mockResolvedValue(new Map())
    const result = await service.getRanking('user-1', '2025-W01')
    expect(result).toEqual({ week: '2025-W01', entries: [] })
    expect(rankingRows).toHaveBeenCalledWith('2025-W01', expect.anything())
  })
})

describe('WorldBossService.exchange', () => {
  const slot = Object.values(EnumEquipmentSlot)[0]
  const id = SHIELDED.id
  const rare = EnumEquipmentGrade.RARE
  const notFound = new NotFoundException('Exchange not found')

  it.each([
    ['unknown boss', 'nope', rare],
    ['legendary piece', id, EnumEquipmentGrade.LEGENDARY],
    ['mythic piece', id, EnumEquipmentGrade.MYTHIC],
    ['grade without a price', id, EnumEquipmentGrade.COMMON],
  ])('does not sell %s', async (_name, bossId, grade) => {
    const { service, dataSource } = setup()
    await expect(service.exchange('user-1', bossId, slot, grade)).rejects.toThrow(notFound)
    expect(dataSource.transaction).not.toHaveBeenCalled()
  })

  it('does not sell the pieces of a craft set', async () => {
    const { service } = setup()
    ;(isCraftSetId as jest.Mock).mockReturnValue(true)
    await expect(service.exchange('user-1', id, slot, rare)).rejects.toThrow(notFound)
  })

  it('needs a reward from that boss claimed before', async () => {
    const { service, etm } = setup()
    await expect(service.exchange('user-1', id, slot, rare)).rejects.toThrow(
      new BadRequestException('Take part in this world boss first')
    )
    expect(etm.query).toHaveBeenCalledWith(expect.stringContaining('reward_claimed_at'), [
      'user-1',
      id,
    ])
  })

  it('refuses a full bag and missing tokens, spending nothing in the first case', async () => {
    const { service, etm, inventory } = setup()
    etm.query.mockResolvedValue([{ found: 1 }])
    ;(isEquipmentBagFull as jest.Mock).mockResolvedValue(true)
    await expect(service.exchange('user-1', id, slot, rare)).rejects.toThrow(
      new BadRequestException('Equipment bag is full')
    )
    expect(inventory.spend).not.toHaveBeenCalled()
    ;(isEquipmentBagFull as jest.Mock).mockResolvedValue(false)
    inventory.spend.mockResolvedValue(false)
    await expect(service.exchange('user-1', id, slot, rare)).rejects.toThrow(
      new BadRequestException('Not enough boss tokens')
    )
    expect(grantItem).not.toHaveBeenCalled()
  })

  it('spends the tokens and grants the set piece of the boss', async () => {
    const { service, etm, inventory } = setup()
    etm.query.mockResolvedValue([{ found: 1 }])
    inventory.getInventory.mockResolvedValue({ items: [] })

    const result = await service.exchange('user-1', id, slot, rare)

    expect(inventory.spend).toHaveBeenCalledWith(
      'user-1',
      bossTokenItemId(id),
      RAID_EXCHANGE_COST[rare],
      etm
    )
    expect(grantItem).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ grade: rare, slot }),
      `exchange:${id}`,
      etm
    )
    expect(findWorldBoss(id)).toBeDefined()
    expect(result).toEqual({ item: { view: 'piece-1' }, items: [] })
  })
})
