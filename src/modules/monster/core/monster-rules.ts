import { EnumMonsterStage } from '../../../db/entities/monster.entity'

// Every tunable number of the V-Pet rules lives here. Durations are in game minutes - the engine
// simulates one minute at a time (see monster-engine.ts). GET /monster/wiki publishes these
// values, so the in-game guide always matches the rules.

export const MAX_HEARTS = 4
export const MAX_POOPS = 4
// How many living monsters one player can raise at the same time.
export const MAX_LIVING_MONSTERS = 4

// How long a monster stays in each stage before trying to evolve, in stage-progress minutes
// (an online minute counts ONLINE_EVOLUTION_MULTIPLIER times). null = never evolves further.
// PERFECT tries once when its time is up; when no evolution matches, it stays PERFECT for good.
export const STAGE_DURATION_MINUTES: Record<EnumMonsterStage, number | null> = {
  [EnumMonsterStage.EGG]: 2,
  [EnumMonsterStage.BABY_1]: 15,
  [EnumMonsterStage.BABY_2]: 90,
  [EnumMonsterStage.ADULT]: 6 * 60,
  [EnumMonsterStage.PERFECT]: 12 * 60,
  [EnumMonsterStage.ULTIMATE]: null,
  [EnumMonsterStage.FUSED]: null,
}

export interface IStageRates {
  // Minutes for one heart of fullness/strength to drain.
  fullnessMinutes: number
  strengthMinutes: number
  poopEveryMinutes: number
}

export const STAGE_RATES: Record<Exclude<EnumMonsterStage, EnumMonsterStage.EGG>, IStageRates> = {
  [EnumMonsterStage.BABY_1]: { fullnessMinutes: 10, strengthMinutes: 10, poopEveryMinutes: 30 },
  [EnumMonsterStage.BABY_2]: { fullnessMinutes: 30, strengthMinutes: 30, poopEveryMinutes: 60 },
  [EnumMonsterStage.ADULT]: { fullnessMinutes: 60, strengthMinutes: 75, poopEveryMinutes: 120 },
  [EnumMonsterStage.PERFECT]: { fullnessMinutes: 75, strengthMinutes: 90, poopEveryMinutes: 120 },
  [EnumMonsterStage.ULTIMATE]: { fullnessMinutes: 90, strengthMinutes: 100, poopEveryMinutes: 120 },
  [EnumMonsterStage.FUSED]: { fullnessMinutes: 90, strengthMinutes: 100, poopEveryMinutes: 120 },
}

// Hearts a freshly hatched monster starts with.
export const HATCH_FULLNESS = 2
export const HATCH_STRENGTH = 2

// Neglect (fullness or strength at 0) counts a care mistake after the first 30 minutes, then
// again every 4 hours it stays at 0.
export const NEGLECT_FIRST_MISTAKE_MINUTES = 30
export const NEGLECT_REPEAT_MISTAKE_MINUTES = 4 * 60

export const SICK_AFTER_HUNGRY_MINUTES = 6 * 60
export const DEATH_AFTER_SICK_MINUTES = 12 * 60
export const DEATH_AFTER_HUNGRY_MINUTES = 24 * 60
// Counted from hatching, so an egg never ages.
export const LIFESPAN_MINUTES = 5 * 24 * 60
// A merged monster starts a fresh life (age resets) that lasts longer.
export const FUSED_LIFESPAN_MINUTES = 7 * 24 * 60
export const getLifespanMinutes = (stage: EnumMonsterStage) =>
  stage === EnumMonsterStage.FUSED ? FUSED_LIFESPAN_MINUTES : LIFESPAN_MINUTES

// Ultimate Merge: two of the player's own Ultimates become one Fused monster.
// Rare (spiritual) eggs cost Raid Tokens to hatch.
export const RARE_EGG_RAID_TOKEN_PRICE = 30

export const MERGE_COIN_COST = 2000
export const MERGE_GEM_COST = 20
// Fused base stats are the Ultimate base stats times this (then the parents' line lean).
export const MERGE_POWER_MULTIPLIER = 1.3
// Merging two different lines (the hybrid fused forms) is switched off while those forms are
// redesigned; two Ultimates of the same line still merge into its awakened form. Hybrids already
// raised stay as they are.
export const CROSS_LINE_MERGE_ENABLED = false

// A minute counts as "online" when it falls within this long after the player's last request.
// The page polls every minute while it is open and visible, so an open page stays online.
export const ONLINE_GRACE_MINUTES = 2
export const ONLINE_EVOLUTION_MULTIPLIER = 2

export const DEX_DISCOVERY_GEM_REWARD = 1

// Adventure stamina, per monster: 0-100, spent only by adventure fights (manual and auto), and
// regained over time - ONLINE_STAMINA_REGEN_MULTIPLIER times as fast while the owner is online.
// A monster with less than one fight's worth can't go on an adventure.
export const MAX_STAMINA = 100
export const ADVENTURE_STAMINA_COST = 10
export const STAMINA_REGEN_PER_HOUR = 10
export const ONLINE_STAMINA_REGEN_MULTIPLIER = 2

// Stamina mini-game: stop the moving bar in the target zone MINIGAME_ROUNDS times.
export const MINIGAME_ROUNDS = 3
// Stamina gained by number of hits (index = hits).
export const MINIGAME_STAMINA_REWARDS = [10, 15, 20, 30]
export const MINIGAME_COOLDOWN_MS = 5 * 60 * 1000

export const STAMINA_REFILL_GEM_PRICE = 5

export const TRAIN_COOLDOWN_MS = 60 * 1000
export const TRAIN_WEIGHT_LOSS = 2
export const FEED_WEIGHT_GAIN = 1
export const VITAMIN_WEIGHT_GAIN = 2

// Safety cap for one tick - a living monster dies of starvation or old age long before this.
export const MAX_TICK_MINUTES = 30 * 24 * 60

// Fighting burns a little weight on every fight.
export const BATTLE_WEIGHT_LOSS = 1

export const PREMIUM_MEAT_FULLNESS = 2
export const PREMIUM_MEAT_WEIGHT_GAIN = 1
export const PROTEIN_STRENGTH = 2
export const PROTEIN_WEIGHT_GAIN = 1
export const DIET_TEA_WEIGHT_LOSS = 5

// Idle mode, offline: send the monster out on an expedition and collect when back. Minutes only
// accrue while it is healthy; it heads home on its own when sick, starving or out of time.
export const EXPEDITION_MAX_MINUTES = 8 * 60
// Fullness/strength drain this much as fast while out exploring.
export const EXPEDITION_DRAIN_MULTIPLIER = 0.5
// One consumable drop per this many minutes explored.
export const EXPEDITION_DROP_EVERY_MINUTES = 4 * 60
// A monster stronger or weaker than the area's recommended form earns more or less, within bounds.
export const EXPEDITION_POWER_MULTIPLIER_MIN = 0.5
export const EXPEDITION_POWER_MULTIPLIER_MAX = 1.5

// Skip: a stage cleared once can be swept without fighting, paying stamina for each run and getting
// a normal win's reward. Up to this many runs per request.
export const ADVENTURE_SKIP_MAX_RUNS = 10

// Equipment (phase 3). Slot/grade data lives in equipment-data.ts, the enhance table in
// enhance-engine.ts.
export const EQUIPMENT_CAPACITY = 200
export const EQUIPMENT_BOX_PRICE = 120
// Chance (out of 10,000) that a manual adventure win drops a piece; auto-battle and expeditions never do.
export const EQUIPMENT_DROP_CHANCE_BP = 800
// Shop materials.
export const ENHANCE_STONE_PRICE = 40

// Async PvP (phase 4). ELO constants live in elo.ts, season rewards in pvp-data.ts.
export const PVP_DAILY_ATTEMPTS = 10
export const PVP_WIN_COIN = 15
export const PVP_LOSS_COIN = 3
export const PVP_DEFENSE_COOLDOWN_MS = 30 * 60 * 1000
export const PVP_OPPONENT_COUNT = 3
// Real players only: the same defender can be challenged this many times per Thai day.
export const PVP_MAX_FIGHTS_PER_OPPONENT_PER_DAY = 2
// Real opponents must be within this many rating points of the challenger.
export const PVP_RATING_WINDOW = 600
export const PVP_SEASON_MIN_FIGHTS = 5
// A new season starts from START_RATING plus this share of last season's gain or loss.
export const PVP_SEASON_RESET_KEEP = 0.5
export const PVP_DISPLAY_NAME_MIN = 2
export const PVP_DISPLAY_NAME_MAX = 16

// Boss sets (phase 5). A set whose worn pieces are all enhanced to at least this level has its
// percentage bonuses multiplied (special battle effects are unchanged).
export const SET_ENHANCE_THRESHOLD = 10
export const SET_ENHANCE_MULTIPLIER = 1.5
// Set pieces have a stronger main stat than plain pieces of the same grade.
export const SET_PIECE_MAIN_MULTIPLIER = 1.2

// Boss Raid (phase 5). Difficulty tables and token prices are data in raid-data.ts.
// Attempts refill every RAID_RESET_HOURS (see daily-fights.ts).
export const RAID_ATTEMPTS = 3
export const RAID_RESET_HOURS = 1
// Boss tokens a win pays (the boss's own token, spent to exchange for a piece of its set).
export const RAID_BOSS_TOKENS_PER_WIN = 1

// World Boss (phase 5b). The boss, rotation and reward tables are data in world-boss-data.ts.
// Hits refill every WORLD_BOSS_RESET_HOURS (see daily-fights.ts).
export const WORLD_BOSS_HITS = 3
export const WORLD_BOSS_RESET_HOURS = 3
// A hit lasts this many rounds (or until the team is wiped out).
export const WORLD_BOSS_ROUNDS = 10

// Friends and rental (phase 5c).
export const FRIEND_LIMIT = 30
export const FRIEND_REQUEST_LIMIT = 20
export const GREETS_PER_DAY_PER_FRIEND = 1
export const GIFTS_PER_DAY = 3
export const FRIEND_POINTS_GREET = 1
export const FRIEND_POINTS_GIFT = 2
export const FRIEND_POINTS_RENTAL = 3
export const SUPPORT_COOLDOWN_MS = 30 * 60 * 1000
// What a renter pays the owner per rental, and the most one owner can earn from rentals a day.
export const RENTAL_FEE = 20
export const RENTAL_OWNER_DAILY_CAP = 200
// The costume (fashion) system is switched off for now: buying, wearing and the privacy toggle are
// refused, and no screen sends a costume (own pet or other players'). Costumes already owned and the
// loadouts stored on pets are kept, so switching it back on restores them.
export const COSTUMES_ENABLED = false
