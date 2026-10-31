import { getSeasonReward, PVP_SEASON_REWARDS } from './pvp-data'
import { getSeason, getSeasonResetAt, isSeasonOver, softReset } from './pvp-season'

describe('season', () => {
  it('rolls over at midnight Thai time on the 1st', () => {
    // 16:59 UTC on the 31st = 23:59 Thai, 17:00 UTC = 00:00 on the 1st
    expect(getSeason(new Date('2026-05-31T16:59:00Z'))).toBe('2026-05')
    expect(getSeason(new Date('2026-05-31T17:00:00Z'))).toBe('2026-06')
    expect(getSeasonResetAt(new Date('2026-05-10T00:00:00Z')).toISOString()).toBe(
      '2026-05-31T17:00:00.000Z'
    )
    expect(getSeasonResetAt(new Date('2026-12-15T00:00:00Z')).toISOString()).toBe(
      '2026-12-31T17:00:00.000Z'
    )
  })

  it('knows which seasons have ended', () => {
    const now = new Date('2026-06-10T00:00:00Z')
    expect(isSeasonOver('2026-05', now)).toBe(true)
    expect(isSeasonOver('2026-06', now)).toBe(false)
    expect(isSeasonOver('2026-07', now)).toBe(false)
  })

  it('halves the distance from the start rating', () => {
    expect(softReset(1200)).toBe(1100)
    expect(softReset(800)).toBe(900)
    expect(softReset(1000)).toBe(1000)
  })
})

describe('season rewards', () => {
  it('pays by rank and needs a minimum number of fights', () => {
    expect(getSeasonReward(1, 20)).toBe(PVP_SEASON_REWARDS[0])
    expect(getSeasonReward(2, 20)).toBe(PVP_SEASON_REWARDS[1])
    expect(getSeasonReward(3, 20)).toBe(PVP_SEASON_REWARDS[1])
    expect(getSeasonReward(10, 20)).toBe(PVP_SEASON_REWARDS[2])
    expect(getSeasonReward(11, 5)).toBe(PVP_SEASON_REWARDS[3])
    expect(getSeasonReward(1, 4)).toBeNull()
  })
})
