import { BadRequestException, ConflictException } from '@nestjs/common'
import { MAX_GEAR_MOD } from '../../libs/td-sim'
import { planGearUpgrade } from './gear'
import { GEAR_MOD_COSTS_COINS } from './gear.config'

describe('gear mod costs', () => {
  it('has one positive, rising cost per mod level, matching the sim cap', () => {
    expect(GEAR_MOD_COSTS_COINS).toHaveLength(MAX_GEAR_MOD)
    GEAR_MOD_COSTS_COINS.forEach((cost, i) => {
      expect(cost).toBeGreaterThan(0)
      if (i > 0) expect(cost).toBeGreaterThan(GEAR_MOD_COSTS_COINS[i - 1])
    })
  })
})

describe('planGearUpgrade', () => {
  it('spends the configured cost and raises the level by one', () => {
    expect(planGearUpgrade(0, GEAR_MOD_COSTS_COINS[0])).toEqual({
      cost: GEAR_MOD_COSTS_COINS[0],
      nextLevel: 1,
    })
    expect(planGearUpgrade(2, 1_000_000)).toEqual({
      cost: GEAR_MOD_COSTS_COINS[2],
      nextLevel: 3,
    })
  })

  it('rejects too few coins', () => {
    expect(() => planGearUpgrade(0, GEAR_MOD_COSTS_COINS[0] - 1)).toThrow(BadRequestException)
    expect(() => planGearUpgrade(0, 0)).toThrow(BadRequestException)
  })

  it('rejects an upgrade past the cap, however rich the player is', () => {
    expect(() => planGearUpgrade(MAX_GEAR_MOD, 1_000_000)).toThrow(ConflictException)
    expect(() => planGearUpgrade(MAX_GEAR_MOD + 3, 1_000_000)).toThrow(ConflictException)
  })

  it('treats a bad stored level as invalid rather than guessing a cost', () => {
    expect(() => planGearUpgrade(-1, 1_000_000)).toThrow(ConflictException)
    expect(() => planGearUpgrade(1.5, 1_000_000)).toThrow(ConflictException)
  })
})
