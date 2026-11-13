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

/** One stage: its 7 rounds plus the boss round, and its boss's skill pattern. Stage 1 is the original stage (ROUNDS and the BOSS_* values above). */
export interface BossDef {
  /** Percent of the scaled base hp. */
  hpPct: number
  callKind: EnemyKind
  callEvery: number
  callCount: number
  shieldEvery: number
  shieldTicks: number
  shieldPct: number
  weakHero: HeroId
  weakPct: number
  /** The boss's element; it takes elemental advantage damage like any enemy. */
  element: Element
}
export interface StageDef {
  rounds: readonly { every: number; enemies: readonly EnemyKind[] }[]
  boss: BossDef
}
const BOSS_ONLY = { every: 1, enemies: ['boss'] as EnemyKind[] }
export const STAGES: readonly StageDef[] = [
  {
    rounds: ROUNDS,
    boss: {
      hpPct: ENEMIES.boss.hpPct,
      callKind: 'grunt',
      callEvery: BOSS_CALL_EVERY,
      callCount: BOSS_CALL_COUNT,
      shieldEvery: BOSS_SHIELD_EVERY,
      shieldTicks: BOSS_SHIELD_TICKS,
      shieldPct: BOSS_SHIELD_DAMAGE_PCT,
      weakHero: BOSS_WEAK_HERO,
      weakPct: BOSS_WEAK_DAMAGE_PCT,
      element: 'nature',
    },
  },
  {
    rounds: [
      { every: 40, enemies: [...rep('armored', 4), ...rep('runner', 4)] },
      { every: 36, enemies: [...rep('tank', 2), ...rep('grunt', 6)] },
      { every: 34, enemies: [...rep('swarmer', 10), ...rep('armored', 4)] },
      { every: 40, enemies: [...rep('elite', 1), ...rep('armored', 5), ...rep('runner', 4)] },
      { every: 36, enemies: [...rep('tank', 4), ...rep('armored', 4), ...rep('swarmer', 6)] },
      { every: 32, enemies: [...rep('elite', 2), ...rep('tank', 2), ...rep('runner', 6)] },
      { every: 28, enemies: [...rep('elite', 3), ...rep('armored', 5), ...rep('swarmer', 8)] },
      BOSS_ONLY,
    ],
    boss: {
      hpPct: 8000,
      callKind: 'armored',
      callEvery: 140,
      callCount: 2,
      shieldEvery: 200,
      shieldTicks: 70,
      shieldPct: 25,
      weakHero: 'knight',
      weakPct: 200,
      element: 'ice',
    },
  },
  {
    rounds: [
      { every: 36, enemies: [...rep('runner', 8), ...rep('armored', 4)] },
      { every: 34, enemies: [...rep('elite', 2), ...rep('grunt', 6)] },
      { every: 32, enemies: [...rep('swarmer', 12), ...rep('tank', 2)] },
      { every: 36, enemies: [...rep('elite', 2), ...rep('armored', 5), ...rep('runner', 5)] },
      { every: 32, enemies: [...rep('tank', 4), ...rep('elite', 2), ...rep('swarmer', 6)] },
      { every: 30, enemies: [...rep('elite', 3), ...rep('armored', 5), ...rep('runner', 6)] },
      { every: 26, enemies: [...rep('elite', 4), ...rep('tank', 3), ...rep('swarmer', 10)] },
      BOSS_ONLY,
    ],
    boss: {
      hpPct: 10000,
      callKind: 'runner',
      callEvery: 120,
      callCount: 4,
      shieldEvery: 180,
      shieldTicks: 60,
      shieldPct: 20,
      weakHero: 'archer',
      weakPct: 250,
      element: 'fire',
    },
  },
]
export const STAGE_COUNT = STAGES.length

export type SkillId =
  | 'power'
  | 'haste'
  | 'crit'
  | 'bounty'
  | 'bank'
  | 'repair'
  | 'ember-surge'
  | 'glacial-edge'
  | 'verdant-bloom'
  | 'void-rend'
/** The skills every draft can offer. Relic skills (see RELICS) join the draft only once the relic is unlocked. */
export const SKILL_IDS: readonly SkillId[] = ['power', 'haste', 'crit', 'bounty', 'bank', 'repair']
export const DRAFT_SIZE = 3
/** Per stack: power and haste are percent, crit is added crit percent, bounty is extra kill gold, bank is gold now, repair is HQ health now. */
export const SKILL_POWER_PCT = 25
export const SKILL_HASTE_PCT = 25
export const SKILL_CRIT_PCT = 10
export const SKILL_BOUNTY = 2
export const SKILL_BANK_GOLD = 25
export const SKILL_REPAIR_HP = 3

/** The first three are the starter recruits; the rest mirror the backend gacha heroes (a unit test there keeps the ids in step). */
export type HeroId =
  | 'archer'
  | 'mage'
  | 'knight'
  | 'cinder-witch'
  | 'frost-herald'
  | 'storm-caller'
  | 'sun-oracle'
  | 'moss-healer'
  | 'tide-bard'
  | 'iron-warden'
  | 'dawn-priestess'
  | 'twig-archer'
  | 'ember-lancer'
  | 'glacier-sniper'
  | 'void-blade'
/** damage per shot and ticks between shots (star 1; see STAR_DAMAGE_PCT). */
export const HEROES: Record<HeroId, { damage: number; cooldown: number }> = {
  archer: { damage: 3, cooldown: 8 },
  mage: { damage: 8, cooldown: 20 },
  knight: { damage: 5, cooldown: 12 },
  'cinder-witch': { damage: 6, cooldown: 18 },
  'frost-herald': { damage: 7, cooldown: 18 },
  'storm-caller': { damage: 9, cooldown: 18 },
  'sun-oracle': { damage: 12, cooldown: 18 },
  'moss-healer': { damage: 2, cooldown: 8 },
  'tide-bard': { damage: 3, cooldown: 8 },
  'iron-warden': { damage: 4, cooldown: 8 },
  'dawn-priestess': { damage: 5, cooldown: 8 },
  'twig-archer': { damage: 3, cooldown: 8 },
  'ember-lancer': { damage: 5, cooldown: 10 },
  'glacier-sniper': { damage: 8, cooldown: 14 },
  'void-blade': { damage: 12, cooldown: 16 },
}
export const HERO_IDS = Object.keys(HEROES) as HeroId[]

/** Star level: a hero starts at 1 and the backend raises it by spending shards. */
export const MAX_STAR = 5
/** Damage multiplier (percent) per star; index 0 is star 1. */
export const STAR_DAMAGE_PCT: readonly number[] = [100, 115, 130, 150, 175]
/** From this star a hero's stronger skill is unlocked: it reloads at STRONG_SKILL_COOLDOWN_PCT of the normal time. */
export const STRONG_SKILL_STAR = 3
export const STRONG_SKILL_COOLDOWN_PCT = 70

/** Gear mod level: a hero's upgrade level (0 to MAX_GEAR_MOD), bought with coins by the backend. Damage multiplier (percent) per mod level; index 0 is level 0. */
export const GEAR_MOD_DAMAGE_PCT: readonly number[] = [100, 108, 116, 124, 132, 140]
export const MAX_GEAR_MOD = GEAR_MOD_DAMAGE_PCT.length - 1

/** A battle's summon pool is the player's owned heroes (with star levels). A player who owns none plays with this pool. */
export const STARTER_POOL: readonly { hero: HeroId; star: number }[] = [
  { hero: 'archer', star: 1 },
  { hero: 'mage', star: 1 },
  { hero: 'knight', star: 1 },
]

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

/** Elements. Fire beats nature, nature beats ice, ice beats fire; physical is neutral. Each hero and each enemy kind has one (see elements.ts). */
export type Element = 'fire' | 'ice' | 'nature' | 'physical'
export const ELEMENTS: readonly Element[] = ['fire', 'ice', 'nature', 'physical']
/** What each element beats; null means it beats nothing and nothing beats it. */
export const ELEMENT_BEATS: Record<Element, Element | null> = {
  fire: 'nature',
  nature: 'ice',
  ice: 'fire',
  physical: null,
}
/** Damage multiplier (percent) for an attacker whose element beats the target's, and for one the target's element beats. */
export const ADVANTAGE_PCT = 150
export const DISADVANTAGE_PCT = 75

/** Cores: the player has CORE_SLOTS slots; an equipped core adds CORE_DAMAGE_PCT[rarity] percent damage to heroes of its element (cores of one element add up). */
export type CoreRarity = 'common' | 'rare' | 'epic' | 'legendary'
export const CORE_RARITIES: readonly CoreRarity[] = ['common', 'rare', 'epic', 'legendary']
export const CORE_SLOTS = 4
export const CORE_DAMAGE_PCT: Record<CoreRarity, number> = {
  common: 10,
  rare: 20,
  epic: 35,
  legendary: 50,
}

/**
 * Relics: unlocking a relic adds its exclusive skill to the draft; each stack picked adds
 * RELIC_SKILL_DAMAGE_PCT percent damage to that relic's hero. Matching rule (enforced by the
 * backend at unlock): the player owns `hero` and owns a core of `element`, the hero's own element.
 */
export type RelicId = 'ember-brand' | 'frost-sigil' | 'grove-totem' | 'void-shard'
export const RELIC_IDS: readonly RelicId[] = [
  'ember-brand',
  'frost-sigil',
  'grove-totem',
  'void-shard',
]
export const RELICS: Record<RelicId, { hero: HeroId; element: Element; skill: SkillId }> = {
  'ember-brand': { hero: 'cinder-witch', element: 'fire', skill: 'ember-surge' },
  'frost-sigil': { hero: 'frost-herald', element: 'ice', skill: 'glacial-edge' },
  'grove-totem': { hero: 'moss-healer', element: 'nature', skill: 'verdant-bloom' },
  'void-shard': { hero: 'void-blade', element: 'physical', skill: 'void-rend' },
}
export const RELIC_SKILL_DAMAGE_PCT = 50
