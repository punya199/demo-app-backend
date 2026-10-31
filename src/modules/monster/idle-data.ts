import { ADVENTURE_AREAS, IAdventureArea, IAdventureStage } from './adventure-data'
import {
  AUTO_BATTLE_REWARD_RATIO,
  EXPEDITION_DROP_EVERY_MINUTES,
  EXPEDITION_POWER_MULTIPLIER_MAX,
  EXPEDITION_POWER_MULTIPLIER_MIN,
} from './monster-rules'
import { EnumShopItemId } from './shop-data'
import { IBattleStats, STAGE_BASE_STATS } from './species-data'

// Coins per hour a monster of the area's recommended form earns while exploring. Auto-battle on
// the same area pays a little more per hour (idle-data.spec.ts keeps it that way), which is the
// reason to keep the game open.
const EXPEDITION_COINS_PER_HOUR: Record<string, number> = {
  meadow: 100,
  coast: 300,
  volcano: 550,
}

// Consumables an expedition can bring home, one random pick per drop.
export const EXPEDITION_DROP_ITEMS = [EnumShopItemId.PREMIUM_MEAT, EnumShopItemId.PROTEIN]

const power = (stats: IBattleStats) => stats.hp / 5 + stats.atk + stats.def + stats.spd

export const findExpeditionArea = (areaId: string): IAdventureArea | undefined =>
  ADVENTURE_AREAS.find(area => area.id === areaId && areaId in EXPEDITION_COINS_PER_HOUR)

// Coins/hour for this monster in this area: the area's base rate scaled by how its power compares
// with the recommended form's, within bounds.
export const getExpeditionRate = (area: IAdventureArea, stats: IBattleStats) => {
  const ratio = power(stats) / power(STAGE_BASE_STATS[area.recommendedStage])
  const multiplier = Math.min(
    EXPEDITION_POWER_MULTIPLIER_MAX,
    Math.max(EXPEDITION_POWER_MULTIPLIER_MIN, ratio)
  )
  return EXPEDITION_COINS_PER_HOUR[area.id] * multiplier
}

export const getExpeditionBaseRate = (areaId: string) => EXPEDITION_COINS_PER_HOUR[areaId]

export const calcExpeditionCoins = (minutes: number, ratePerHour: number) =>
  Math.floor((minutes * ratePerHour) / 60)

export const calcExpeditionDrops = (minutes: number) =>
  Math.floor(minutes / EXPEDITION_DROP_EVERY_MINUTES)

// Auto-battle pays a fraction of the stage's normal reward, at least 1 coin.
export const calcAutoBattleReward = (stage: IAdventureStage) =>
  Math.max(1, Math.round(stage.reward * AUTO_BATTLE_REWARD_RATIO))
