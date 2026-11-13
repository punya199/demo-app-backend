import { BadRequestException, ConflictException } from '@nestjs/common'
import { GEAR_MOD_COSTS_COINS } from './gear.config'

export interface IGearUpgradePlan {
  cost: number
  nextLevel: number
}

// Pure. Decides a gear mod upgrade from the hero's current mod level and the player's coin
// balance, so the money rules are testable without a database.
export function planGearUpgrade(level: number, coins: number): IGearUpgradePlan {
  if (!Number.isInteger(level) || level < 0 || level >= GEAR_MOD_COSTS_COINS.length) {
    throw new ConflictException('The gear mod is already at the top level')
  }
  const cost = GEAR_MOD_COSTS_COINS[level]
  if (coins < cost) {
    throw new BadRequestException('Not enough coins')
  }
  return { cost, nextLevel: level + 1 }
}
