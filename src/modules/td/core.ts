import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { CoreEntry, CORE_RARITIES, CORE_SLOTS, ELEMENTS, STAGE_COUNT } from '../../libs/td-sim'
import { CORE_FIRST_CLEAR_GRANTS, CORE_PROMOTE_COSTS } from './core.config'

export interface ICorePromotionPlan {
  cost: { coins: number; shards: number }
  nextRarity: CoreEntry['rarity']
}

// Pure. Decides a promotion from the core's stored rarity and the player's balances.
export function planCorePromotion(
  rarity: string,
  balances: { coins: number; shards: number }
): ICorePromotionPlan {
  const i = CORE_RARITIES.indexOf(rarity as CoreEntry['rarity'])
  if (i < 0 || i >= CORE_PROMOTE_COSTS.length) {
    throw new ConflictException('The core cannot be promoted further')
  }
  const cost = CORE_PROMOTE_COSTS[i]
  if (balances.coins < cost.coins) throw new BadRequestException('Not enough coins')
  if (balances.shards < cost.shards) throw new BadRequestException('Not enough shards')
  return { cost, nextRarity: CORE_RARITIES[i + 1] }
}

// Pure. `displacedId` is the core that must leave the slot (null when it is free or already ours).
export function planCoreEquip(
  coreId: string,
  slot: number,
  cores: readonly { id: string; slot: number | null }[]
): { displacedId: string | null } {
  if (!Number.isInteger(slot) || slot < 0 || slot >= CORE_SLOTS) {
    throw new BadRequestException('Unknown core slot')
  }
  if (!cores.some(c => c.id === coreId)) throw new NotFoundException('Core not found')
  const holder = cores.find(c => c.slot === slot)
  return { displacedId: holder && holder.id !== coreId ? holder.id : null }
}

// Pure. The core a first clear of the stage grants.
export function coreGrantFor(stageId: number): CoreEntry {
  if (!Number.isInteger(stageId) || stageId < 1 || stageId > STAGE_COUNT) {
    throw new BadRequestException('Unknown stage')
  }
  return { ...CORE_FIRST_CLEAR_GRANTS[stageId - 1] }
}

// Pure. The battle's equipped cores from a player's core rows; the caller stores the result with
// the battle session so the replay uses this exact snapshot. Unequipped rows and rows the sim
// would reject are dropped, so a bad row can never make the later replay fail validation.
export function battleCores(
  rows: readonly { slot: number | null; element: string; rarity: string }[]
): CoreEntry[] {
  return rows
    .filter(
      r =>
        r.slot !== null &&
        Number.isInteger(r.slot) &&
        r.slot >= 0 &&
        r.slot < CORE_SLOTS &&
        ELEMENTS.includes(r.element as CoreEntry['element']) &&
        CORE_RARITIES.includes(r.rarity as CoreEntry['rarity'])
    )
    .sort((a, b) => (a.slot as number) - (b.slot as number))
    .map(r => ({
      element: r.element as CoreEntry['element'],
      rarity: r.rarity as CoreEntry['rarity'],
    }))
}

// Pure. The core list the screen draws: the next promotion price, or null at the top rarity.
export const coreView = (r: {
  id: string
  element: string
  rarity: string
  slot: number | null
}) => {
  const i = CORE_RARITIES.indexOf(r.rarity as CoreEntry['rarity'])
  return {
    id: r.id,
    element: r.element,
    rarity: r.rarity,
    slot: r.slot,
    promoteCost: i >= 0 && i < CORE_PROMOTE_COSTS.length ? CORE_PROMOTE_COSTS[i] : null,
  }
}
