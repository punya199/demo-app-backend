import { EntityManager } from 'typeorm'
import { PlayerFurnitureEntity } from '../../../db/entities/player-furniture.entity'
import {
  emptyFarmTiers,
  EnumFurnitureKind,
  farmEffects,
  FarmTiers,
  FURNITURE_KINDS,
  MAX_FURNITURE_TIER,
} from './farm-data'

// The player's furniture tiers; a kind never bought is tier 0.
export const loadFarmTiers = async (userId: string, etm: EntityManager): Promise<FarmTiers> => {
  const rows = (await etm.find(PlayerFurnitureEntity, { where: { userId } })) ?? []
  const tiers = emptyFarmTiers()
  for (const row of rows) {
    if (FURNITURE_KINDS.includes(row.kind as EnumFurnitureKind)) {
      tiers[row.kind as EnumFurnitureKind] = Math.max(0, Math.min(MAX_FURNITURE_TIER, row.tier))
    }
  }
  return tiers
}

// What the tick engine multiplies in for this player's monsters (one cheap read per request).
export const loadFarmEffects = async (userId: string, etm: EntityManager) =>
  farmEffects(await loadFarmTiers(userId, etm))
