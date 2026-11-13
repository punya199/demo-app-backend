import { BadRequestException, ConflictException } from '@nestjs/common'
import { HEROES, MAX_GEAR_MOD, MAX_STAR, STARTER_POOL } from '../../libs/td-sim'
import { TD_HEROES } from './gacha.config'
import { buildPool, planStarUp } from './hero'
import { STAR_UP_SHARD_COSTS } from './hero.config'

describe('star-up costs', () => {
  it('has one positive, rising cost per star step', () => {
    expect(STAR_UP_SHARD_COSTS).toHaveLength(MAX_STAR - 1)
    STAR_UP_SHARD_COSTS.forEach((cost, i) => {
      expect(cost).toBeGreaterThan(0)
      if (i > 0) expect(cost).toBeGreaterThan(STAR_UP_SHARD_COSTS[i - 1])
    })
  })

  it('every gacha hero exists in the sim, or a pulled hero could not be summoned', () => {
    for (const hero of TD_HEROES) expect(Object.keys(HEROES)).toContain(hero.id)
  })
})

describe('planStarUp', () => {
  it('spends the configured cost and raises the star by one', () => {
    expect(planStarUp(1, STAR_UP_SHARD_COSTS[0])).toEqual({
      cost: STAR_UP_SHARD_COSTS[0],
      nextStar: 2,
    })
    expect(planStarUp(3, 10_000)).toEqual({ cost: STAR_UP_SHARD_COSTS[2], nextStar: 4 })
  })

  it('rejects too few shards', () => {
    expect(() => planStarUp(1, STAR_UP_SHARD_COSTS[0] - 1)).toThrow(BadRequestException)
    expect(() => planStarUp(2, 0)).toThrow(BadRequestException)
  })

  it('rejects a hero already at the top star', () => {
    expect(() => planStarUp(MAX_STAR, 10_000)).toThrow(ConflictException)
  })
})

describe('buildPool', () => {
  it('is the starter pool for a player with no heroes', () => {
    expect(buildPool([])).toEqual(STARTER_POOL)
  })

  it('is exactly the owned heroes with their stars, in a stable order', () => {
    const pool = buildPool([
      { heroId: 'void-blade', starLevel: 3 },
      { heroId: 'cinder-witch', starLevel: 1 },
    ])
    expect(pool).toEqual([
      { hero: 'cinder-witch', star: 1, mod: 0 },
      { hero: 'void-blade', star: 3, mod: 0 },
    ])
  })

  it("carries each hero's gear mod level, clamped to the cap, 0 when there is none", () => {
    const pool = buildPool(
      [
        { heroId: 'void-blade', starLevel: 1 },
        { heroId: 'cinder-witch', starLevel: 1 },
        { heroId: 'sun-oracle', starLevel: 1 },
      ],
      { 'void-blade': 2, 'cinder-witch': 99, ghost: 4 }
    )
    expect(pool).toEqual([
      { hero: 'cinder-witch', star: 1, mod: MAX_GEAR_MOD },
      { hero: 'sun-oracle', star: 1, mod: 0 },
      { hero: 'void-blade', star: 1, mod: 2 },
    ])
  })

  it('drops unknown heroes and clamps a bad star, so the replay can never be refused for it', () => {
    const pool = buildPool([
      { heroId: 'ghost', starLevel: 1 },
      { heroId: 'void-blade', starLevel: 99 },
      { heroId: 'cinder-witch', starLevel: 0 },
    ])
    expect(pool).toEqual([
      { hero: 'cinder-witch', star: 1, mod: 0 },
      { hero: 'void-blade', star: MAX_STAR, mod: 0 },
    ])
    expect(buildPool([{ heroId: 'ghost', starLevel: 1 }])).toEqual(STARTER_POOL)
  })
})
