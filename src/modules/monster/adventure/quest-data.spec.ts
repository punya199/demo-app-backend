import { EnumMonsterLogType } from '../../../db/entities/monster-log.entity'
import { IMonsterEvent } from '../core/monster-engine'
import {
  countQuestProgress,
  DAILY_QUESTS,
  EnumQuestId,
  findQuest,
  getLoginStatus,
  getQuestDate,
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

describe('login streak', () => {
  it('extends on consecutive days, restarts after a gap and cycles every 7 days', () => {
    expect(getLoginStatus(new Set(), '2026-05-10')).toMatchObject({ streak: 0, day: 1 })
    expect(getLoginStatus(new Set(['2026-05-09']), '2026-05-10')).toMatchObject({
      streak: 1,
      day: 2,
    })
    expect(getLoginStatus(new Set(['2026-05-08']), '2026-05-10')).toMatchObject({
      streak: 0,
      day: 1,
    })
    const week = new Set(['04', '05', '06', '07', '08', '09', '10'].map(d => `2026-05-${d}`))
    expect(getLoginStatus(week, '2026-05-10')).toMatchObject({
      claimedToday: true,
      streak: 7,
      day: 7,
    })
    week.add('2026-05-11')
    expect(getLoginStatus(week, '2026-05-11')).toMatchObject({ streak: 8, day: 1 })
  })
})
