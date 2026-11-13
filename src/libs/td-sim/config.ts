/** Every tunable number lives here. All placeholders (see SPEC section 2): integers only, so the sim stays deterministic. */
export const COLS = 5
export const ROWS = 6
export const TILE_COUNT = COLS * ROWS

export const START_GOLD = 30
export const START_HP = 10
export const SUMMON_COST = 10
/** +1 run-gold every this many ticks. */
export const INCOME_EVERY = 8
export const KILL_REWARD = 3

/** Lane length in lane-units; enemies walk from 0 to LANE_LENGTH, then leak. */
export const LANE_LENGTH = 1000
export const ENEMY_BASE_HP = 800
/** Enemy hp grows this many percent per round (round 0 is the first). */
export const HP_GROWTH_PCT = 80

export type EnemyKind = 'grunt' | 'runner' | 'tank' | 'armored' | 'swarmer' | 'elite' | 'boss'
/** hpPct: share of the scaled base hp; speed: lane-units per tick; reward: gold on kill; armor: flat damage cut per hit (a hit always does at least 1); leak: HQ health lost on reaching the HQ. */
export const ENEMIES: Record<
  EnemyKind,
  { hpPct: number; speed: number; reward: number; armor: number; leak: number }
> = {
  grunt: { hpPct: 100, speed: 2, reward: 3, armor: 0, leak: 1 },
  runner: { hpPct: 50, speed: 4, reward: 3, armor: 0, leak: 1 },
  tank: { hpPct: 300, speed: 1, reward: 8, armor: 0, leak: 2 },
  armored: { hpPct: 150, speed: 2, reward: 5, armor: 2, leak: 1 },
  swarmer: { hpPct: 30, speed: 3, reward: 1, armor: 0, leak: 1 },
  elite: { hpPct: 400, speed: 3, reward: 10, armor: 1, leak: 2 },
  boss: { hpPct: 6000, speed: 1, reward: 50, armor: 1, leak: 6 },
}

const rep = (kind: EnemyKind, n: number): EnemyKind[] => Array<EnemyKind>(n).fill(kind)
/** One entry per round, then the boss round last. The k-th enemy of a round spawns k * every ticks after the round starts. */
export const ROUNDS: readonly { every: number; enemies: readonly EnemyKind[] }[] = [
  { every: 45, enemies: rep('grunt', 6) },
  { every: 38, enemies: [...rep('grunt', 4), ...rep('runner', 4)] },
  { every: 38, enemies: [...rep('swarmer', 8), ...rep('grunt', 4)] },
  { every: 45, enemies: [...rep('armored', 4), ...rep('runner', 4), 'tank'] },
  { every: 38, enemies: [...rep('tank', 3), ...rep('armored', 4), ...rep('swarmer', 6)] },
  { every: 33, enemies: [...rep('elite', 2), ...rep('runner', 6), ...rep('armored', 4)] },
  { every: 30, enemies: [...rep('elite', 3), ...rep('tank', 3), ...rep('swarmer', 10)] },
  { every: 1, enemies: ['boss'] },
]
export const ROUND_COUNT = ROUNDS.length - 1
/** Index of the boss round in ROUNDS. */
export const BOSS_ROUND = ROUND_COUNT

/** Boss skill pattern, read off the round clock: it calls grunts, and is shielded for part of every cycle. */
export const BOSS_CALL_EVERY = 160
export const BOSS_CALL_COUNT = 3
export const BOSS_SHIELD_EVERY = 240
export const BOSS_SHIELD_TICKS = 80
export const BOSS_SHIELD_DAMAGE_PCT = 25
/** Weakness: this hero deals this percent damage to the boss. */
export const BOSS_WEAK_HERO: HeroId = 'mage'
export const BOSS_WEAK_DAMAGE_PCT = 200

export type SkillId = 'power' | 'haste' | 'crit' | 'bounty' | 'bank' | 'repair'
export const SKILL_IDS: readonly SkillId[] = ['power', 'haste', 'crit', 'bounty', 'bank', 'repair']
export const DRAFT_SIZE = 3
/** Per stack: power and haste are percent, crit is added crit percent, bounty is extra kill gold, bank is gold now, repair is HQ health now. */
export const SKILL_POWER_PCT = 25
export const SKILL_HASTE_PCT = 25
export const SKILL_CRIT_PCT = 10
export const SKILL_BOUNTY = 2
export const SKILL_BANK_GOLD = 25
export const SKILL_REPAIR_HP = 3

export type HeroId = 'archer' | 'mage' | 'knight'
/** damage per shot and ticks between shots. */
export const HEROES: Record<HeroId, { damage: number; cooldown: number }> = {
  archer: { damage: 3, cooldown: 8 },
  mage: { damage: 8, cooldown: 20 },
  knight: { damage: 5, cooldown: 12 },
}
export const HERO_IDS = Object.keys(HEROES) as HeroId[]

/** Energy source: sits just off the board edge, feeding this tile (bottom row, middle). A gear here is linked. */
export const SOURCE_TILE = 27
/** -2 tiles: a gear standing here deals only PENALTY_OUTPUT_PCT of its output. */
export const PENALTY_TILES: readonly number[] = [6, 8, 16, 18]
export const PENALTY_OUTPUT_PCT = 50

/** Charge units: a gear needs hero.cooldown * CHARGE_SCALE to fire, and gains CHARGE_BASE + CHARGE_PER_SIDE * touching each tick while linked. */
export const CHARGE_SCALE = 10
export const CHARGE_BASE = 10
export const CHARGE_PER_SIDE = 5
/** Output grows with every touching side (percent of base damage). */
export const SIDE_OUTPUT_PCT = 20

/** Damage multiplier (percent) per gear level; index 0 is level 1. Each step is at least 2x the one below, so a merge never loses power. */
export const LEVEL_OUTPUT_PCT: readonly number[] = [100, 220, 480, 1000, 2100]
export const MAX_LEVEL = LEVEL_OUTPUT_PCT.length

/** Resonance: crit chance (percent) per adjacent gear of the same hero, capped; a crit multiplies damage. */
export const RESONANCE_CRIT_PCT = 15
export const MAX_CRIT_PCT = 60
export const CRIT_OUTPUT_PCT = 200
