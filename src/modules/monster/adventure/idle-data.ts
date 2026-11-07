import { ADVENTURE_AREAS, IAdventureArea } from './adventure-data'
import { CRAFT_ESSENCE_ID } from '../equipment/craft-materials'
import {
  EXPEDITION_DROP_EVERY_MINUTES,
  EXPEDITION_POWER_MULTIPLIER_MAX,
  EXPEDITION_POWER_MULTIPLIER_MIN,
} from '../core/monster-rules'
import { EnumShopItemId } from '../equipment/shop-data'
import { IBattleStats, STAGE_BASE_STATS } from '../core/species-data'

// Coins per hour a monster of the area's recommended form earns while exploring.
const EXPEDITION_COINS_PER_HOUR: Record<string, number> = {
  meadow: 100,
  coast: 300,
  volcano: 550,
  cavern: 750,
  storm_peak: 900,
}

// Consumables an expedition can bring home, one random pick per drop.
export const EXPEDITION_DROP_ITEMS: string[] = [
  EnumShopItemId.PREMIUM_MEAT,
  EnumShopItemId.PROTEIN,
  // The six craft essences (see craft.md): an expedition drop is one random pick of all eight.
  ...Object.values(CRAFT_ESSENCE_ID),
]

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
