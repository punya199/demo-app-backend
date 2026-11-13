// Stage rewards and star rules. Placeholders until balancing (SPEC section 6).
/** Gems paid once, on the first clear of each stage. Index 0 is stage 1; the length must equal the sim's STAGE_COUNT (see stage.spec.ts). */
export const STAGE_FIRST_CLEAR_GEMS: readonly number[] = [150, 225, 300]
/** A win earns 1 star; it earns a 2nd and a 3rd when the HQ ends with at least this much health (the sim starts it at 10). */
export const STAR_MIN_HP: readonly [number, number] = [5, 9]
/** Paid by each sweep of a 3-star stage (never gems). Index 0 is stage 1; the length must equal the sim's STAGE_COUNT. */
export const STAGE_SWEEP_REWARDS: readonly { coins: number; shards: number }[] = [
  { coins: 130, shards: 5 },
  { coins: 160, shards: 8 },
  { coins: 200, shards: 12 },
]
/** Stars a stage needs before it can be swept. */
export const SWEEP_MIN_STARS = 3
