import { createRng } from './battle-engine'
import {
  canProtect,
  ENHANCE_STEPS,
  effectiveRate,
  MAX_ENHANCE_LEVEL,
  PITY_MAX,
  resolveEnhance,
} from './enhance-engine'

const always = (value: number) => () => value

describe('enhance table', () => {
  it('follows the roadmap rates and failure tiers', () => {
    const at = (level: number) => ENHANCE_STEPS[level - 1]
    for (const level of [1, 2, 3, 4, 5]) {
      expect(at(level).rate).toBe(1)
    }
    expect(at(6).rate).toBe(0.8)
    expect(at(9).rate).toBe(0.5)
    expect(at(10).rate).toBe(0.4)
    expect(at(12).rate).toBe(0.2)
    expect(at(13).rate).toBe(0.15)
    expect(at(15).rate).toBe(0.05)
    expect(at(8).onFail).toBe('material')
    expect(at(11).onFail).toBe('drop')
    expect(at(14).onFail).toBe('drop_or_break')
    expect(ENHANCE_STEPS).toHaveLength(MAX_ENHANCE_LEVEL)
  })
})

describe('resolveEnhance', () => {
  it('always succeeds up to +5 and resets pity', () => {
    const result = resolveEnhance(2, 3, false, always(0.999))
    expect(result).toMatchObject({ success: true, newLevel: 3, newPity: 0, broke: false })
  })

  it('keeps the level on a +6..+9 failure and counts pity', () => {
    const result = resolveEnhance(7, 0, false, always(0.999))
    expect(result).toMatchObject({ success: false, newLevel: 7, newPity: 1, broke: false })
  })

  it('drops one level on a +10..+12 failure, and protect prevents it', () => {
    expect(resolveEnhance(10, 0, false, always(0.999)).newLevel).toBe(9)
    const protectedResult = resolveEnhance(10, 0, true, always(0.999))
    expect(protectedResult).toMatchObject({ newLevel: 10, protectUsed: true, broke: false })
  })

  it('may break on a +13..+15 failure, and protect prevents it', () => {
    // first roll fails the attempt, second (< 0.5) breaks it
    const rolls = [0.999, 0.1]
    const broken = resolveEnhance(14, 0, false, () => rolls.shift()!)
    expect(broken).toMatchObject({ success: false, broke: true, newLevel: 14 })
    const survived = [0.999, 0.9]
    expect(resolveEnhance(14, 0, false, () => survived.shift()!)).toMatchObject({
      broke: false,
      newLevel: 13,
    })
    expect(resolveEnhance(14, 0, true, always(0.999)).broke).toBe(false)
  })

  it('does not consume protection when a failure costs nothing', () => {
    expect(canProtect(7)).toBe(false)
    expect(canProtect(10)).toBe(true)
    expect(canProtect(MAX_ENHANCE_LEVEL)).toBe(false)
    expect(resolveEnhance(7, 0, true, always(0.999)).protectUsed).toBe(false)
  })

  it('raises the rate with pity, capped', () => {
    const step = ENHANCE_STEPS[14] // +15, 5%
    expect(effectiveRate(step, 0)).toBeCloseTo(0.05)
    expect(effectiveRate(step, 5)).toBeCloseTo(0.15)
    expect(effectiveRate(step, 500)).toBeCloseTo(0.05 + PITY_MAX)
    expect(effectiveRate(ENHANCE_STEPS[0], 5)).toBe(1)
  })
})

describe('enhance economy', () => {
  // Climb from +0 to a target with a seeded RNG (protect scrolls from +10) and total the spend.
  const climb = (target: number, seed: number) => {
    const rand = createRng(seed)
    let level = 0
    let pity = 0
    let coin = 0
    while (level < target) {
      const step = ENHANCE_STEPS[level]
      coin += step.coin
      const result = resolveEnhance(level, pity, level >= 10, rand)
      level = result.newLevel
      pity = result.newPity
    }
    return coin
  }
  const averageCoins = (target: number) => {
    const runs = Array.from({ length: 100 }, (_, index) => climb(target, index + 1))
    return runs.reduce((sum, coin) => sum + coin, 0) / runs.length
  }

  it('keeps +10 reachable (~9k coins) and +15 a real sink (~50k)', () => {
    const ten = averageCoins(10)
    const fifteen = averageCoins(15)
    expect(ten).toBeGreaterThan(5000)
    expect(ten).toBeLessThan(15000)
    expect(fifteen).toBeGreaterThan(ten * 3)
  })
})
