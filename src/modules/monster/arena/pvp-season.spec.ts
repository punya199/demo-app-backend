import { getSeasonReward, PVP_SEASON_REWARDS } from './pvp-data'
import { getSeason, getSeasonResetAt, isSeasonOver, softReset } from './pvp-season'

describe('season', () => {
  it('rolls over at Monday midnight Thai time', () => {
    // 16:59 UTC Sunday = 23:59 Thai, 17:00 UTC = Monday 00:00 Thai
    expect(getSeason(new Date('2026-11-08T16:59:00Z'))).toBe('2026-W45')
    expect(getSeason(new Date('2026-11-08T17:00:00Z'))).toBe('2026-W46')
    expect(getSeasonResetAt(new Date('2026-11-05T00:00:00Z')).toISOString()).toBe(
      '2026-11-08T17:00:00.000Z'
    )
    // ISO year edge: 2026-12-31 Thai is already week 53, 2027-01-04 starts 2027-W01
    expect(getSeason(new Date('2026-12-30T00:00:00Z'))).toBe('2026-W53')
    expect(getSeason(new Date('2027-01-04T00:00:00Z'))).toBe('2027-W01')
  })

  it('knows which seasons have ended, old monthly keys included', () => {
    const now = new Date('2026-11-10T00:00:00Z')
    expect(isSeasonOver('2026-11', now)).toBe(true)
    expect(isSeasonOver('2026-W45', now)).toBe(true)
    expect(isSeasonOver('2026-W46', now)).toBe(false)
    expect(isSeasonOver('2026-W47', now)).toBe(false)
    expect(isSeasonOver('2026-W53', new Date('2027-01-04T00:00:00Z'))).toBe(true)
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
