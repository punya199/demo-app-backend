import { HttpException } from '@nestjs/common'
import { STAGE_COUNT } from '../../libs/td-sim'
import { STAGE_FIRST_CLEAR_GEMS, STAGE_SWEEP_REWARDS, STAR_MIN_HP } from './stage.config'
import { assertStageUnlocked, planStageClear, planSweep, stageList, starsFor } from './stage'

const statusOf = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    return (e as HttpException).getStatus()
  }
  return 0
}

describe('stage config', () => {
  it('has a first-clear reward for every stage the sim has', () => {
    expect(STAGE_FIRST_CLEAR_GEMS).toHaveLength(STAGE_COUNT)
    expect(STAR_MIN_HP).toHaveLength(2)
  })
})

describe('starsFor', () => {
  it('gives no stars for a loss, whatever HQ health is left', () => {
    expect(starsFor('lost', 10)).toBe(0)
  })
  it('gives 1 star for a win with little health, 2 and 3 at the thresholds', () => {
    expect(starsFor('won', 1)).toBe(1)
    expect(starsFor('won', STAR_MIN_HP[0] - 1)).toBe(1)
    expect(starsFor('won', STAR_MIN_HP[0])).toBe(2)
    expect(starsFor('won', STAR_MIN_HP[1] - 1)).toBe(2)
    expect(starsFor('won', STAR_MIN_HP[1])).toBe(3)
    expect(starsFor('won', 10)).toBe(3)
  })
})

describe('assertStageUnlocked', () => {
  it('always opens stage 1', () => {
    expect(() => assertStageUnlocked(1, [])).not.toThrow()
  })
  it('refuses stage N until stage N-1 has a star', () => {
    expect(statusOf(() => assertStageUnlocked(2, []))).toBe(403)
    expect(statusOf(() => assertStageUnlocked(3, [{ stageId: 1, stars: 3 }]))).toBe(403)
    expect(statusOf(() => assertStageUnlocked(2, [{ stageId: 1, stars: 0 }]))).toBe(403)
    expect(() => assertStageUnlocked(2, [{ stageId: 1, stars: 1 }])).not.toThrow()
    expect(() =>
      assertStageUnlocked(3, [
        { stageId: 1, stars: 1 },
        { stageId: 2, stars: 1 },
      ])
    ).not.toThrow()
  })
  it('refuses a stage that does not exist', () => {
    expect(statusOf(() => assertStageUnlocked(0, []))).toBe(400)
    expect(statusOf(() => assertStageUnlocked(STAGE_COUNT + 1, []))).toBe(400)
  })
})

describe('planStageClear', () => {
  it('a first win pays that stage gems and records the stars', () => {
    expect(planStageClear(2, null, 2)).toEqual({
      firstClear: true,
      stars: 2,
      gems: STAGE_FIRST_CLEAR_GEMS[1],
    })
  })
  it('a repeat win pays nothing and keeps the best stars', () => {
    expect(planStageClear(1, 3, 1)).toEqual({ firstClear: false, stars: 3, gems: 0 })
    expect(planStageClear(1, 1, 3)).toEqual({ firstClear: false, stars: 3, gems: 0 })
  })
  it('a loss changes nothing', () => {
    expect(planStageClear(1, null, 0)).toEqual({ firstClear: false, stars: 0, gems: 0 })
    expect(planStageClear(1, 2, 0)).toEqual({ firstClear: false, stars: 2, gems: 0 })
  })
})

describe('stageList', () => {
  it('shows stars and locks each stage behind the previous one', () => {
    const list = stageList([{ stageId: 1, stars: 2 }])
    expect(list.map(s => [s.stageId, s.stars, s.cleared, s.unlocked])).toEqual([
      [1, 2, true, true],
      [2, 0, false, true],
      [3, 0, false, false],
    ])
    expect(list.map(s => s.firstClearGems)).toEqual([...STAGE_FIRST_CLEAR_GEMS])
  })
  it('a new player only has stage 1', () => {
    expect(stageList([]).map(s => s.unlocked)).toEqual([true, false, false])
  })
})

describe('planSweep', () => {
  const three = [{ stageId: 1, stars: 3 }]

  it('pays the configured coins and shards, never gems, for a 3-star stage', () => {
    expect(planSweep(1, three)).toEqual({
      coins: STAGE_SWEEP_REWARDS[0].coins,
      shards: STAGE_SWEEP_REWARDS[0].shards,
    })
  })

  it('has a reward for every stage the sim has', () => {
    expect(STAGE_SWEEP_REWARDS).toHaveLength(STAGE_COUNT)
  })

  it('refuses a stage below 3 stars or never cleared (409)', () => {
    expect(statusOf(() => planSweep(1, [{ stageId: 1, stars: 2 }]))).toBe(409)
    expect(statusOf(() => planSweep(1, []))).toBe(409)
  })

  it('refuses a locked stage (403) and an unknown stage (400)', () => {
    expect(statusOf(() => planSweep(2, []))).toBe(403)
    expect(statusOf(() => planSweep(STAGE_COUNT + 1, three))).toBe(400)
  })
})
