import { findCostume } from '../equipment/costume-data'
import { EnumMonsterLogType } from '../../../db/entities/monster-log.entity'
import { IMonsterEvent } from '../core/monster-engine'
import {
  countQuestProgress,
  DAILY_QUESTS,
  EnumQuestId,
  findQuest,
  getLoginMonthRange,
  getLoginStatus,
  LOGIN_BOARD_SIZE,
  LOGIN_COSTUME_ID,
  LOGIN_REWARDS,
  rollLoginBox,
  getQuestDate,
  getQuestDayStart,
  getQuestPeriod,
  getQuestResetAt,
  WEEKLY_QUESTS,
} from './quest-data'

const event = (type: EnumMonsterLogType, payload: Record<string, unknown>): IMonsterEvent => ({
  type,
  at: new Date(),
  payload,
})

describe('countQuestProgress', () => {
  it('counts actions and won battles only', () => {
    const counts = countQuestProgress([
      event(EnumMonsterLogType.ACTION, { action: 'feed' }),
      event(EnumMonsterLogType.ACTION, { action: 'feed' }),
      event(EnumMonsterLogType.ACTION, { action: 'train' }),
      event(EnumMonsterLogType.ACTION, { action: 'clean' }),
      event(EnumMonsterLogType.ACTION, { action: 'expedition_start' }),
      event(EnumMonsterLogType.ACTION, { action: 'expedition_claim' }),
      event(EnumMonsterLogType.ACTION, { action: 'medicine' }),
      event(EnumMonsterLogType.BATTLE, { won: true }),
      event(EnumMonsterLogType.BATTLE, { won: false }),
      event(EnumMonsterLogType.SHOP, { itemId: 'protein' }),
    ])
    expect(Object.fromEntries(counts)).toEqual({
      [EnumQuestId.FEED]: 2,
      [EnumQuestId.TRAIN]: 1,
      [EnumQuestId.CLEAN]: 1,
      [EnumQuestId.EXPEDITION]: 1,
      [EnumQuestId.BATTLE_WIN]: 1,
      [EnumQuestId.WEEKLY_FEED]: 2,
      [EnumQuestId.WEEKLY_TRAIN]: 1,
      [EnumQuestId.WEEKLY_EXPEDITION]: 1,
      [EnumQuestId.WEEKLY_BATTLE_WIN]: 1,
    })
  })
})

describe('quest day', () => {
  it('rolls over at midnight Thai time', () => {
    // 16:59 UTC = 23:59 Thai, 17:00 UTC = 00:00 the next Thai day
    expect(getQuestDate(new Date('2026-05-01T16:59:00Z'))).toBe('2026-05-01')
    expect(getQuestDate(new Date('2026-05-01T17:00:00Z'))).toBe('2026-05-02')
    expect(getQuestResetAt(new Date('2026-05-01T16:59:00Z')).toISOString()).toBe(
      '2026-05-01T17:00:00.000Z'
    )
    expect(getQuestResetAt(new Date('2026-05-01T17:00:00Z')).toISOString()).toBe(
      '2026-05-02T17:00:00.000Z'
    )
  })

  it('starts the Thai day 24 hours before the reset', () => {
    expect(getQuestDayStart(new Date('2026-05-01T16:59:00Z')).toISOString()).toBe(
      '2026-04-30T17:00:00.000Z'
    )
  })
})

describe('weekly quests', () => {
  it('count the same activity as their daily source and key rows by ISO week', () => {
    expect(WEEKLY_QUESTS.every(quest => findQuest(quest.source!)?.period === 'daily')).toBe(true)
    const ids = [...DAILY_QUESTS, ...WEEKLY_QUESTS].map(quest => quest.id)
    expect(new Set(ids).size).toBe(ids.length)
    const weekly = findQuest(EnumQuestId.WEEKLY_FEED)!
    // Sunday 23:59 Thai and Monday 00:00 Thai fall in different weeks
    expect(getQuestPeriod(weekly, new Date('2026-05-03T16:59:00Z'))).toBe('2026-W18')
    expect(getQuestPeriod(weekly, new Date('2026-05-03T17:00:00Z'))).toBe('2026-W19')
    expect(getQuestPeriod(findQuest(EnumQuestId.FEED)!, new Date('2026-05-03T17:00:00Z'))).toBe(
      '2026-05-04'
    )
  })

  it('pay gems for every weekly quest', () => {
    expect(WEEKLY_QUESTS.every(quest => quest.gemReward > 0)).toBe(true)
  })
})

describe('monthly login board', () => {
  const claims = (n: number) => new Set(Array.from({ length: n }, (_, i) => `2026-05-${i + 1}`))

  it('uses the next slot for the number of claims this month, gaps included', () => {
    expect(getLoginStatus(new Set(), '2026-05-10')).toMatchObject({ claimed: 0, day: 1 })
    expect(getLoginStatus(new Set(['2026-05-01']), '2026-05-10')).toMatchObject({
      claimedToday: false,
      claimed: 1,
      day: 2,
    })
    expect(getLoginStatus(new Set(['2026-05-10']), '2026-05-10')).toMatchObject({
      claimedToday: true,
      claimed: 1,
      day: 1,
    })
  })

  it('has no reward left after 28 claims', () => {
    expect(getLoginStatus(claims(27), '2026-05-30').reward).toBe(LOGIN_REWARDS[27])
    expect(getLoginStatus(claims(28), '2026-05-30').reward).toBeNull()
  })

  it('covers the month range for the query', () => {
    expect(getLoginMonthRange('2026-02-14')).toEqual(['2026-02-01', '2026-02-31'])
  })

  it('has 28 slots, a monthly costume on the last and a bounded gem budget', () => {
    expect(LOGIN_REWARDS).toHaveLength(LOGIN_BOARD_SIZE)
    expect(LOGIN_REWARDS[27].costume).toBe(LOGIN_COSTUME_ID)
    expect(findCostume(LOGIN_COSTUME_ID)).toBeDefined()
    expect(LOGIN_REWARDS.reduce((sum, reward) => sum + reward.gem, 0)).toBeLessThanOrEqual(35)
  })

  it('rolls boxes from the right table', () => {
    const low = () => 0
    const high = () => 0.999
    expect(rollLoginBox('S', low)).toMatchObject({ coin: 50 })
    expect(rollLoginBox('S', high).items).toEqual([{ itemId: 'training_manual', qty: 1 }])
    expect(rollLoginBox('M', () => 0.6).gem).toBeGreaterThan(0)
    expect(rollLoginBox('M', high).items).toEqual([{ itemId: 'craft_catalyst', qty: 1 }])
    const large = rollLoginBox('L', low)
    expect(large.gem).toBeGreaterThanOrEqual(3)
    expect(large.items).toEqual([{ itemId: 'craft_forge_core', qty: 1 }])
  })
})
