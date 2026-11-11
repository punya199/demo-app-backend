import { EnumMonsterLine, EnumMonsterStage } from '../../../db/entities/monster.entity'
import { averageRoll, IPotential } from '../core/monster-potential'
import { MonsterRuleError } from '../core/monster-engine'
import { RARE_EGG_LINES } from '../core/species-data'

// Pet market rules. Pets are sold for gems, player to player. Mirrored in the guide through wiki.ts.

// Perfect and beyond: younger pets are too cheap to be worth a market slot.
export const MARKET_STAGES: readonly EnumMonsterStage[] = [
  EnumMonsterStage.PERFECT,
  EnumMonsterStage.ULTIMATE,
  EnumMonsterStage.FUSED,
]

export const MARKET_FEE_RATE = 0.1
export const MARKET_PRICE_MIN_RATIO = 0.5
export const MARKET_PRICE_MAX_RATIO = 2
export const MARKET_LISTING_MS = 48 * 60 * 60 * 1000
export const MARKET_MAX_ACTIVE_LISTINGS = 3
export const MARKET_RESALE_COOLDOWN_MS = 24 * 60 * 60 * 1000
export const MARKET_MAX_BUYS_PER_DAY = 5
export const MARKET_DAY_MS = 24 * 60 * 60 * 1000
// A bought pet starts with half-full hearts, so buying a neglected pet is not a trap.
export const MARKET_NEUTRAL_HEARTS = 2

const BASE_VALUE: Partial<Record<EnumMonsterStage, number>> = {
  [EnumMonsterStage.PERFECT]: 30,
  [EnumMonsterStage.ULTIMATE]: 80,
  [EnumMonsterStage.FUSED]: 200,
}
const SPIRITUAL_MULTIPLIER = 1.5

// What the formula thinks a pet is worth in gems: a base by stage, more for spiritual lines, and
// x0.75 to x1.25 by the average potential roll (a pet from before potential counts as average).
export const referenceValue = (
  stage: EnumMonsterStage,
  line: EnumMonsterLine,
  potential: IPotential | null
) => {
  const base = BASE_VALUE[stage]
  if (!base) {
    throw new MonsterRuleError('This stage can not be sold on the market')
  }
  const roll = potential ? averageRoll(potential) : 0.5
  const lineMultiplier = RARE_EGG_LINES.includes(line) ? SPIRITUAL_MULTIPLIER : 1
  return Math.max(1, Math.round(base * lineMultiplier * (0.75 + 0.5 * roll)))
}

export const priceBand = (reference: number) => ({
  min: Math.max(1, Math.ceil(reference * MARKET_PRICE_MIN_RATIO)),
  max: Math.floor(reference * MARKET_PRICE_MAX_RATIO),
})

export const marketFee = (price: number) => Math.floor(price * MARKET_FEE_RATE)

// Why a pet can not be listed right now, or null when it can.
export const listingBlocker = (
  pet: {
    stage: EnumMonsterStage
    diedAt: Date | null
    expeditionAreaId: string | null
    marketBoundUntil: Date | null
  },
  now: Date
) => {
  if (pet.diedAt) {
    return 'This monster is already gone'
  }
  if (!MARKET_STAGES.includes(pet.stage)) {
    return 'Only a monster in its perfect form or beyond can be sold'
  }
  if (pet.expeditionAreaId) {
    return 'Bring the monster back from its expedition first'
  }
  if (pet.marketBoundUntil && pet.marketBoundUntil.getTime() > now.getTime()) {
    return 'A monster bought on the market can not be resold yet'
  }
  return null
}
