import type { RelicId } from '../../libs/td-sim'

// Relic unlock prices, spent once through the ledger. Placeholders until balancing (SPEC section 6).
// Which hero and core element a relic needs lives in td-sim's RELICS, next to its skill.
export const RELIC_UNLOCK_COSTS: Record<RelicId, { coins: number; shards: number }> = {
  'ember-brand': { coins: 1500, shards: 150 },
  'frost-sigil': { coins: 1500, shards: 150 },
  'grove-totem': { coins: 1500, shards: 150 },
  'void-shard': { coins: 2000, shards: 200 },
}
