import { EnumMonsterLogType } from '../../../db/entities/monster-log.entity'
import { IMonsterEvent } from '../core/monster-engine'
import { getWeek } from '../boss/world-boss-data'
import { CRAFT_CATALYST_ID, CRAFT_RARE_ID } from '../equipment/craft-materials'
import { EnumShopItemId } from '../equipment/shop-data'

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

// Monthly login board: 28 slots. A claim fills the next slot, so the slot is the number of claims
// this month (missing a day only delays the rest, it never resets progress). One claim per Thai day,
// stored as a `daily_login` row in daily_quest_progress; the board starts over on the 1st.
export const LOGIN_QUEST_ID = 'daily_login'
export const LOGIN_BOARD_SIZE = 28

export type LoginBox = 'S' | 'M' | 'L'
export interface ILoginReward {
  coin: number
  gem: number
  items?: { itemId: string; qty: number }[]
  // Rolled when claimed (see rollLoginBox) and opened on the spot.
  box?: LoginBox
  // A costume id from the catalog, granted once (a repeat month is skipped, not paid twice).
  costume?: string
}

export const LOGIN_COSTUME_ID = 'loginCrown'
const MEAT = EnumShopItemId.PREMIUM_MEAT
const PROTEIN = EnumShopItemId.PROTEIN
const TEA = EnumShopItemId.DIET_TEA
const MANUAL = EnumShopItemId.TRAINING_MANUAL
const r = (coin: number, gem = 0, extra: Partial<ILoginReward> = {}): ILoginReward => ({
  coin,
  gem,
  ...extra,
})
const item = (itemId: string, qty = 1) => ({ items: [{ itemId, qty }] })

export const LOGIN_REWARDS: ILoginReward[] = [
  r(50), // 1
  r(50), // 2
  r(50, 0, item(MEAT, 2)), // 3
  r(60), // 4
  r(60, 2), // 5
  r(40, 0, item(MANUAL)), // 6
  r(0, 0, { box: 'S' }), // 7
  r(60), // 8
  r(70), // 9
  r(70, 3, item(MEAT)), // 10
  r(70), // 11
  r(80, 0, item(PROTEIN)), // 12
  r(80), // 13
  r(80, 5), // 14
  r(80, 0, item(PROTEIN, 2)), // 15
  r(80), // 16
  r(90, 0, item(MANUAL)), // 17
  r(90, 3), // 18
  r(90), // 19
  r(0, 0, { box: 'M' }), // 20
  r(100, 5), // 21
  r(100), // 22
  r(100, 0, item(TEA, 2)), // 23
  r(100, 0, item(MANUAL, 2)), // 24
  r(100, 3), // 25
  r(100), // 26
  r(0, 0, { box: 'M' }), // 27
  r(0, 10, { box: 'L', costume: LOGIN_COSTUME_ID }), // 28
]

const between = (rng: () => number, min: number, max: number) =>
  min + Math.floor(rng() * (max - min + 1))

// What a mystery box pays. S is mostly coin or a snack, M adds gems and a small catalyst chance, L
// always pays gems and may drop a rare craft core.
export const rollLoginBox = (size: LoginBox, rng: () => number = Math.random): ILoginReward => {
  const roll = rng() * 100
  if (size === 'S') {
    if (roll < 60) return r(between(rng, 50, 150))
    if (roll < 75) return r(0, 0, item(MEAT, 2))
    if (roll < 90) return r(0, 0, item(PROTEIN, 2))
    return r(0, 0, item(MANUAL))
  }
  if (size === 'M') {
    if (roll < 50) return r(between(rng, 100, 250))
    if (roll < 80) return r(0, between(rng, 1, 3))
    if (roll < 95) return r(0, 0, item(MANUAL, 2))
    return r(0, 0, item(CRAFT_CATALYST_ID))
  }
  const rare = rng() < 0.25 ? [{ itemId: CRAFT_RARE_ID.forge, qty: 1 }] : undefined
  return r(between(rng, 150, 300), between(rng, 3, 6), rare ? { items: rare } : {})
}

const DAY_MS = 24 * 60 * 60 * 1000
export const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)

// `claimed` holds this month's Thai dates (YYYY-MM-DD) with a login claim. `day` is the 1-based slot
// of today's reward (already claimed or next to claim); `reward` is null once all 28 are claimed.
export const getLoginStatus = (claimed: Set<string>, today: string) => {
  const claimedToday = claimed.has(today)
  const count = claimed.size
  const day = claimedToday ? count : count + 1
  return {
    claimedToday,
    claimed: count,
    day,
    reward: LOGIN_REWARDS[day - 1] ?? null,
  }
}

// First and last possible date key of the month holding `date`, for a string range query.
export const getLoginMonthRange = (date: string) =>
  [`${date.slice(0, 7)}-01`, `${date.slice(0, 7)}-31`] as const
