import type { CoreEntry } from '../../libs/td-sim'

// Core rules. Placeholders until balancing (SPEC section 6).
// Promotion cost per rarity step, so index 0 is common -> rare. Both materials are spent through
// the ledger. The length must be CORE_RARITIES.length - 1 (see core.spec.ts).
export const CORE_PROMOTE_COSTS: readonly { coins: number; shards: number }[] = [
  { coins: 200, shards: 20 },
  { coins: 500, shards: 50 },
  { coins: 1200, shards: 120 },
]

// The core granted once, on the first clear of each stage. Index 0 is stage 1; the length must
// equal the sim's STAGE_COUNT (see core.spec.ts). Cores come from nowhere else for now.
export const CORE_FIRST_CLEAR_GRANTS: readonly CoreEntry[] = [
  { element: 'fire', rarity: 'common' },
  { element: 'ice', rarity: 'common' },
  { element: 'nature', rarity: 'common' },
]
