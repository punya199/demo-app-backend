import { EnumMonsterLogType } from '../../db/entities/monster-log.entity'
import { IMonsterEvent } from './monster-engine'
import { getWeek } from './world-boss-data'

export enum EnumQuestId {
  FEED = 'feed',
  TRAIN = 'train',
  CLEAN = 'clean',
  BATTLE_WIN = 'battle_win',
  EXPEDITION = 'expedition',
  WEEKLY_BATTLE_WIN = 'weekly_battle_win',
  WEEKLY_TRAIN = 'weekly_train',
  WEEKLY_FEED = 'weekly_feed',
  WEEKLY_EXPEDITION = 'weekly_expedition',
}

export interface IQuest {
  id: EnumQuestId
  name: string
  emoji: string
  target: number
  coinReward: number
  gemReward: number
  period: 'daily' | 'weekly'
  // Weekly quests count the same activity as this daily quest.
  source?: EnumQuestId
}

export const DAILY_QUESTS: IQuest[] = [
  {
    id: EnumQuestId.FEED,
    name: 'ให้อาหาร 3 ครั้ง',
    emoji: '🍖',
    target: 3,
    coinReward: 10,
    gemReward: 0,
    period: 'daily',
  },
  {
    id: EnumQuestId.TRAIN,
    name: 'ฝึก 3 ครั้ง',
    emoji: '💪',
    target: 3,
    coinReward: 15,
    gemReward: 0,
    period: 'daily',
  },
  {
    id: EnumQuestId.CLEAN,
    name: 'เก็บอึ 1 ครั้ง',
    emoji: '🧹',
    target: 1,
    coinReward: 5,
    gemReward: 0,
    period: 'daily',
  },
  {
    id: EnumQuestId.EXPEDITION,
    name: 'ส่งมอนออกสำรวจ 1 ครั้ง',
    emoji: '🧭',
    target: 1,
    coinReward: 15,
    gemReward: 1,
    period: 'daily',
  },
  {
    id: EnumQuestId.BATTLE_WIN,
    name: 'ชนะการต่อสู้ 2 ครั้ง',
    emoji: '⚔️',
    target: 2,
    coinReward: 20,
    gemReward: 1,
    period: 'daily',
  },
]

// Weekly quests reset Monday 00:00 Thai time (ISO week). Gems are the point of these: about 15
// a week in total, plus 2 a day from the daily set.
export const WEEKLY_QUESTS: IQuest[] = [
  {
    id: EnumQuestId.WEEKLY_BATTLE_WIN,
    name: 'ชนะการต่อสู้ 15 ครั้ง',
    emoji: '🏆',
    target: 15,
    coinReward: 300,
    gemReward: 5,
    period: 'weekly',
    source: EnumQuestId.BATTLE_WIN,
  },
  {
    id: EnumQuestId.WEEKLY_EXPEDITION,
    name: 'ส่งมอนออกสำรวจ 7 ครั้ง',
    emoji: '🗺️',
    target: 7,
    coinReward: 200,
    gemReward: 4,
    period: 'weekly',
    source: EnumQuestId.EXPEDITION,
  },
  {
    id: EnumQuestId.WEEKLY_TRAIN,
    name: 'ฝึก 15 ครั้ง',
    emoji: '🏋️',
    target: 15,
    coinReward: 150,
    gemReward: 3,
    period: 'weekly',
    source: EnumQuestId.TRAIN,
  },
  {
    id: EnumQuestId.WEEKLY_FEED,
    name: 'ให้อาหาร 14 ครั้ง',
    emoji: '🍲',
    target: 14,
    coinReward: 100,
    gemReward: 3,
    period: 'weekly',
    source: EnumQuestId.FEED,
  },
]

export const findQuest = (questId: string) =>
  [...DAILY_QUESTS, ...WEEKLY_QUESTS].find(quest => (quest.id as string) === questId)

// The row key that scopes a quest's progress: the Thai day, or the Thai ISO week (2026-W19).
export const getQuestPeriod = (quest: IQuest, now: Date) =>
  quest.period === 'weekly' ? getWeek(now).key : getQuestDate(now)

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000

// The quest day rolls over at midnight Thai time (UTC+7, no DST), as YYYY-MM-DD.
export const getQuestDate = (now: Date) =>
  new Date(now.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10)

// The start of today's Thai day.
export const getQuestDayStart = (now: Date) =>
  new Date(getQuestResetAt(now).getTime() - 24 * 60 * 60 * 1000)

// When today's quests reset: the next Thai midnight.
export const getQuestResetAt = (now: Date) => {
  const shifted = now.getTime() + BANGKOK_OFFSET_MS
  const dayMs = 24 * 60 * 60 * 1000
  return new Date(Math.floor(shifted / dayMs) * dayMs + dayMs - BANGKOK_OFFSET_MS)
}

// Which quests a batch of monster events moves forward. Every action and battle is
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
      case 'expedition_start':
        add(EnumQuestId.EXPEDITION)
        break
    }
  }
  for (const quest of WEEKLY_QUESTS) {
    const count = counts.get(quest.source!)
    if (count) {
      counts.set(quest.id, count)
    }
  }
  return counts
}

// Daily login: one claim per Thai day, stored as a `daily_login` row in daily_quest_progress. A
// claim on consecutive days extends the streak; the reward repeats every 7 days. Skipping a day
// restarts at day 1.
export const LOGIN_QUEST_ID = 'daily_login'
export const LOGIN_REWARDS = [
  { coin: 50, gem: 0 },
  { coin: 50, gem: 0 },
  { coin: 60, gem: 1 },
  { coin: 60, gem: 0 },
  { coin: 80, gem: 1 },
  { coin: 80, gem: 0 },
  { coin: 150, gem: 5 },
]

const DAY_MS = 24 * 60 * 60 * 1000
export const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)

// `claimed` holds Thai dates (YYYY-MM-DD) with a login claim. `day` is the 1-based position in the
// 7-day cycle of today's reward (already claimed or next to claim).
export const getLoginStatus = (claimed: Set<string>, today: string) => {
  const claimedToday = claimed.has(today)
  let run = 0
  for (
    let date = claimedToday ? today : addDays(today, -1);
    claimed.has(date);
    date = addDays(date, -1)
  ) {
    run++
  }
  const day = claimedToday
    ? ((run - 1) % LOGIN_REWARDS.length) + 1
    : (run % LOGIN_REWARDS.length) + 1
  return { claimedToday, streak: run, day, reward: LOGIN_REWARDS[day - 1] }
}
