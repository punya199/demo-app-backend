// Gear mod upgrade costs in coins. Placeholders until balancing (SPEC section 6): one entry per
// mod level step, so GEAR_MOD_COSTS_COINS[0] is the price of level 0 -> 1. The length is the level
// cap and must equal the sim's MAX_GEAR_MOD (see gear.spec.ts).
export const GEAR_MOD_COSTS_COINS: readonly number[] = [30, 60, 120, 240, 480]
