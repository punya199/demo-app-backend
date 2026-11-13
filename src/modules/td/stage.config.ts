// Stage rewards and star rules. Placeholders until balancing (SPEC section 6).
/** Gems paid once, on the first clear of each stage. Index 0 is stage 1; the length must equal the sim's STAGE_COUNT (see stage.spec.ts). */
export const STAGE_FIRST_CLEAR_GEMS: readonly number[] = [150, 225, 300]
/** A win earns 1 star; it earns a 2nd and a 3rd when the HQ ends with at least this much health (the sim starts it at 10). */
export const STAR_MIN_HP: readonly [number, number] = [5, 9]
