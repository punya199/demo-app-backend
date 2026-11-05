import { ArenaElement, ArenaLine } from './arena-types'

// Arena rule constants (hand-maintained; the skill catalog and tuning live in arena-data.ts).

// Elements: the game's ring and spiritual triangle, but x1.1 / x0.9 in the arena (not 1.3 / 0.8).
export const ARENA_BEATS: Record<ArenaLine, ArenaLine[]> = {
  flame: ['leaf', 'earth'],
  leaf: ['tide', 'lightning'],
  tide: ['flame', 'earth'],
  earth: ['leaf', 'lightning'],
  lightning: ['tide', 'flame'],
  holy: ['dark'],
  dark: ['shadow'],
  shadow: ['holy'],
}
export const ARENA_STRONG = 110
export const ARENA_WEAK = 90

export const arenaEffectiveness = (attacker: ArenaElement | null, defender: ArenaLine) => {
  if (!attacker || attacker === 'neutral') {
    return 100
  }
  if (ARENA_BEATS[attacker].includes(defender)) {
    return ARENA_STRONG
  }
  if (ARENA_BEATS[defender].includes(attacker)) {
    return ARENA_WEAK
  }
  return 100
}

// Evasion (dodge chance), accuracy (cuts the target's dodge chance point for point) and resistance
// (% cut to a debuff's chance and duration): arena-only stats, one value per line.
export const LINE_EVA: Record<ArenaLine, number> = {
  flame: 5,
  tide: 4,
  leaf: 8,
  earth: 2,
  lightning: 9,
  holy: 5,
  dark: 6,
  shadow: 12,
}
export const LINE_ACC: Record<ArenaLine, number> = {
  flame: 8,
  tide: 6,
  leaf: 6,
  earth: 4,
  lightning: 12,
  holy: 10,
  dark: 8,
  shadow: 7,
}
export const LINE_RES: Record<ArenaLine, number> = {
  flame: 8,
  tide: 14,
  leaf: 10,
  earth: 20,
  lightning: 6,
  holy: 18,
  dark: 12,
  shadow: 6,
}

// Adventure bosses shrug off control: extra RES on top of their line's.
export const BOSS_RES = 15

export const ARENA_TICK = 20
export const ARENA_W = 640
export const ARENA_H = 440
export const ARENA_SCALE = 100
export const ARENA_MAX_TICKS = 60 * ARENA_TICK
export const ARENA_HP_SCALE = 3
export const DODGE_BASE = 50
export const DODGE_MAX = 75
export const DODGE_MIN_CD = 4
export const MAX_BUFF_UPTIME = 50
export const SKILL_DELAY_TICKS = 27
export const MAX_RESIST = 70
export const CRIT_CHANCE = 15
export const CRIT_MULTIPLIER = 150
export const EXECUTE_BELOW = 35
// Gear and trainer-tree regen is written per turn; a second in the arena heals this % of that. Kept
// low on purpose: at 10 a full tank tree outlasted the cavern boss to the time limit every fight.
export const ARENA_REGEN_PER_SEC_PCT = 3
// Burn from gear and the tree: chance % on each basic attack, lasting its turns in seconds.
export const ARENA_BURN_CHANCE = 30
// Boss sets: how often the tide set's shield comes back, and when the holy set's last stand fires.
export const ARENA_SHIELD_REFRESH_SEC = 12
export const ARENA_LAST_STAND_BELOW = 35
// SPD % from gear and the tree also quickens attacks: this % of it comes off the attack timing, up
// to the cap. Only a bonus does: a penalty slowed attacks too, and that only helped stalling builds.
export const ARENA_ATTACK_SPEED_PCT = 50
export const ARENA_ATTACK_SPEED_CAP = 30

// Craft sets: the HP share under which the execute bonus applies, and what the on-basic statuses
// and the retort do (seconds / percent of ATK).
export const ARENA_CRAFT_EXECUTE_BELOW = 30
export const ARENA_CRAFT_STATUS_SEC = { slow: 2, defDown: 3, poison: 4, curse: 3, stun: 1 }
// The retort only blinds (power 0 = no counter hit): a counter hit on every melee hit made the
// mirage set win ~75% at any chance.
export const ARENA_CRAFT_RETORT = { power: 0, dur: 2 }
