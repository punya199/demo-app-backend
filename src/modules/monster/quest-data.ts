import { EnumMonsterLogType } from '../../db/entities/monster-log.entity'
import { IMonsterEvent } from './monster-engine'

export enum EnumQuestId {
  FEED = 'feed',
  TRAIN = 'train',
  CLEAN = 'clean',
  MINIGAME = 'minigame',
  BATTLE_WIN = 'battle_win',
  EXPEDITION = 'expedition',
}

export interface IDailyQuest {
  id: EnumQuestId
  name: string
  emoji: string
  target: number
  coinReward: number
}

export const DAILY_QUESTS: IDailyQuest[] = [
  { id: EnumQuestId.FEED, name: 'ให้อาหาร 3 ครั้ง', emoji: '🍖', target: 3, coinReward: 10 },
  { id: EnumQuestId.TRAIN, name: 'ฝึก 3 ครั้ง', emoji: '💪', target: 3, coinReward: 15 },
  { id: EnumQuestId.CLEAN, name: 'เก็บอึ 1 ครั้ง', emoji: '🧹', target: 1, coinReward: 5 },
  { id: EnumQuestId.MINIGAME, name: 'เล่นมินิเกม 1 ครั้ง', emoji: '🎯', target: 1, coinReward: 10 },
  {
    id: EnumQuestId.EXPEDITION,
    name: 'ส่งมอนออกสำรวจ 1 ครั้ง',
    emoji: '🧭',
    target: 1,
    coinReward: 15,
  },
  {
    id: EnumQuestId.BATTLE_WIN,
    name: 'ชนะการต่อสู้ 2 ครั้ง',
    emoji: '⚔️',
    target: 2,
    coinReward: 20,
  },
]

export const findQuest = (questId: string) =>
  DAILY_QUESTS.find(quest => (quest.id as string) === questId)

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000

// The quest day rolls over at midnight Thai time (UTC+7, no DST), as YYYY-MM-DD.
export const getQuestDate = (now: Date) =>
  new Date(now.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10)

// When today's quests reset: the next Thai midnight.
export const getQuestResetAt = (now: Date) => {
  const shifted = now.getTime() + BANGKOK_OFFSET_MS
  const dayMs = 24 * 60 * 60 * 1000
  return new Date(Math.floor(shifted / dayMs) * dayMs + dayMs - BANGKOK_OFFSET_MS)
}

// Which quests a batch of monster events moves forward. Every action, battle and mini-game is
// already logged as an event, so quest progress is derived here instead of in each service.
export const countQuestProgress = (events: IMonsterEvent[]) => {
  const counts = new Map<EnumQuestId, number>()
  const add = (questId: EnumQuestId) => counts.set(questId, (counts.get(questId) ?? 0) + 1)

  for (const event of events) {
    if (event.type === EnumMonsterLogType.BATTLE && event.payload.won === true) {
      add(EnumQuestId.BATTLE_WIN)
    }
    if (event.type !== EnumMonsterLogType.ACTION) {
      continue
    }
    switch (event.payload.action) {
      case 'feed':
        add(EnumQuestId.FEED)
        break
      case 'train':
        add(EnumQuestId.TRAIN)
        break
      case 'clean':
        add(EnumQuestId.CLEAN)
        break
      case 'minigame':
        add(EnumQuestId.MINIGAME)
        break
      case 'expedition_start':
        add(EnumQuestId.EXPEDITION)
        break
    }
  }
  return counts
}
