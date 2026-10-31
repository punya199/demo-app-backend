import { EnumMonsterLogType } from '../../db/entities/monster-log.entity'
import { IMonsterEvent } from './monster-engine'
import { countQuestProgress, EnumQuestId, getQuestDate, getQuestResetAt } from './quest-data'

const event = (type: EnumMonsterLogType, payload: Record<string, unknown>): IMonsterEvent => ({
  type,
  at: new Date(),
  payload,
})

describe('countQuestProgress', () => {
  it('counts actions, mini-games and won battles only', () => {
    const counts = countQuestProgress([
      event(EnumMonsterLogType.ACTION, { action: 'feed' }),
      event(EnumMonsterLogType.ACTION, { action: 'feed' }),
      event(EnumMonsterLogType.ACTION, { action: 'train' }),
      event(EnumMonsterLogType.ACTION, { action: 'clean' }),
      event(EnumMonsterLogType.ACTION, { action: 'minigame', hits: 3 }),
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
      [EnumQuestId.MINIGAME]: 1,
      [EnumQuestId.EXPEDITION]: 1,
      [EnumQuestId.BATTLE_WIN]: 1,
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
