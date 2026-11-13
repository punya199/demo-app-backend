import { HttpException } from '@nestjs/common'
import { ACHIEVEMENTS, DAILY_GOALS, TRACK_GEMS } from './goals.config'
import {
  achievementList,
  dailyList,
  dayBounds,
  planAchievementClaim,
  planDailyClaim,
  planTrackClaim,
  trackState,
  utcDay,
} from './goals'

const statusOf = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    return (e as HttpException).getStatus()
  }
  return 0
}
const NOW = new Date('2026-03-05T23:59:59Z')
const DAY = '2026-03-05'

describe('goals config', () => {
  it('has unique ids and positive targets and rewards', () => {
    const all = [...DAILY_GOALS, ...ACHIEVEMENTS]
    expect(new Set(all.map(g => g.id)).size).toBe(all.length)
    expect(all.every(g => g.target > 0 && g.gems > 0)).toBe(true)
    expect(TRACK_GEMS).toHaveLength(7)
  })
})

describe('day boundary', () => {
  it('is the UTC calendar day, flipping at midnight Z', () => {
    expect(utcDay(NOW)).toBe(DAY)
    expect(utcDay(new Date('2026-03-06T00:00:00Z'))).toBe('2026-03-06')
    const b = dayBounds(NOW)
    expect(b.start.toISOString()).toBe('2026-03-05T00:00:00.000Z')
    expect(b.end.toISOString()).toBe('2026-03-06T00:00:00.000Z')
  })
})

describe('daily goals', () => {
  const none = { battles_won: 0, pulls: 0, gear_upgrades: 0 }
  it('lists progress capped at the target, and claimed state from keys', () => {
    const list = dailyList({ ...none, battles_won: 5 }, new Set([`daily:${DAY}:win_battle`]), DAY)
    const win = list.find(g => g.id === 'win_battle')!
    expect(win).toMatchObject({ progress: 1, target: 1, complete: true, claimed: true })
    expect(list.find(g => g.id === 'pull_once')).toMatchObject({ complete: false, claimed: false })
  })
  it('treats yesterday claim as unclaimed today (reset)', () => {
    const list = dailyList(
      { ...none, battles_won: 1 },
      new Set(['daily:2026-03-04:win_battle']),
      DAY
    )
    expect(list[0].claimed).toBe(false)
  })
  it('pays the configured gems under a per-day key', () => {
    expect(planDailyClaim('win_battle', { ...none, battles_won: 1 }, new Set(), DAY)).toEqual({
      claimKey: `daily:${DAY}:win_battle`,
      gems: 30,
    })
  })
  it('refuses an incomplete goal (400), a second claim (409) and an unknown goal (404)', () => {
    expect(statusOf(() => planDailyClaim('win_battle', none, new Set(), DAY))).toBe(400)
    expect(
      statusOf(() =>
        planDailyClaim(
          'win_battle',
          { ...none, battles_won: 1 },
          new Set([`daily:${DAY}:win_battle`]),
          DAY
        )
      )
    ).toBe(409)
    expect(statusOf(() => planDailyClaim('nope', none, new Set(), DAY))).toBe(404)
  })
})

describe('7-day track', () => {
  it('starts at day 1 and wraps after day 7', () => {
    expect(trackState(0, null, DAY, true)).toMatchObject({ day: 1, gems: 20, claimable: true })
    expect(trackState(6, '2026-03-04', DAY, true)).toMatchObject({ day: 7, gems: 150 })
    expect(trackState(7, '2026-03-04', DAY, true)).toMatchObject({ day: 1, gems: 20 })
  })
  it('allows one claim per day, and only after a daily goal is done', () => {
    expect(trackState(1, DAY, DAY, true).claimable).toBe(false)
    expect(trackState(1, '2026-03-04', DAY, false).claimable).toBe(false)
  })
  it('plans the claim with a sequence key and rejects when not claimable', () => {
    expect(planTrackClaim(2, '2026-03-04', DAY, true)).toEqual({ claimKey: 'track:2', gems: 40 })
    expect(statusOf(() => planTrackClaim(2, DAY, DAY, true))).toBe(409)
    expect(statusOf(() => planTrackClaim(2, '2026-03-04', DAY, false))).toBe(400)
  })
})

describe('achievements', () => {
  const totals = { stars: 4, heroes: 1, pulls: 10 }
  it('is complete from server totals and claimed from keys', () => {
    const list = achievementList(totals, new Set(['ach:pulls_10']))
    expect(list.find(a => a.id === 'stars_3')).toMatchObject({ complete: true, claimed: false })
    expect(list.find(a => a.id === 'stars_9')).toMatchObject({ progress: 4, complete: false })
    expect(list.find(a => a.id === 'pulls_10')).toMatchObject({ complete: true, claimed: true })
  })
  it('pays once and refuses early, repeat and unknown claims', () => {
    expect(planAchievementClaim('stars_3', totals, new Set())).toEqual({
      claimKey: 'ach:stars_3',
      gems: 100,
    })
    expect(statusOf(() => planAchievementClaim('stars_9', totals, new Set()))).toBe(400)
    expect(statusOf(() => planAchievementClaim('stars_3', totals, new Set(['ach:stars_3'])))).toBe(
      409
    )
    expect(statusOf(() => planAchievementClaim('x', totals, new Set()))).toBe(404)
  })
})
