import { EnumMonsterStage } from '../../db/entities/monster.entity'

// Every tunable number of the V-Pet rules lives here. Durations are in game minutes - the engine
// simulates one minute at a time (see monster-engine.ts). GET /monster/wiki publishes these
// values, so the in-game guide always matches the rules.

export const MAX_HEARTS = 4
export const MAX_POOPS = 4

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

// A minute counts as "online" when it falls within this long after the player's last request.
// The page polls every minute while it is open and visible, so an open page stays online.
export const ONLINE_GRACE_MINUTES = 2
export const ONLINE_EVOLUTION_MULTIPLIER = 2

// Stamina: 0-100, drains over time (half as fast online). At 0 every battle stat is halved.
export const MAX_STAMINA = 100
export const STAMINA_DRAIN_FULL_MINUTES_OFFLINE = 12 * 60
export const STAMINA_DRAIN_FULL_MINUTES_ONLINE = 24 * 60
export const BATTLE_STAMINA_COST = 10
export const NO_STAMINA_STAT_MULTIPLIER = 0.5

// Stamina mini-game: stop the moving bar in the target zone MINIGAME_ROUNDS times.
export const MINIGAME_ROUNDS = 3
// Stamina gained by number of hits (index = hits).
export const MINIGAME_STAMINA_REWARDS = [10, 15, 20, 30]
export const MINIGAME_COOLDOWN_MS = 5 * 60 * 1000

export const STAMINA_REFILL_GEM_PRICE = 5
export const DEX_DISCOVERY_GEM_REWARD = 1

export const TRAIN_COOLDOWN_MS = 60 * 1000
export const TRAIN_WEIGHT_LOSS = 2
export const FEED_WEIGHT_GAIN = 1
export const VITAMIN_WEIGHT_GAIN = 2

// Safety cap for one tick - a living monster dies of starvation or old age long before this.
export const MAX_TICK_MINUTES = 30 * 24 * 60

// Fighting burns a little weight on top of its stamina cost.
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

// Idle mode, online: auto-battle repeats an already-cleared normal stage. Each fight is cheap in
// stamina and pays a fraction of the stage reward, with a per-day coin cap against scripts.
export const AUTO_BATTLE_COOLDOWN_MS = 60 * 1000
export const AUTO_BATTLE_STAMINA_COST = 1
export const AUTO_BATTLE_REWARD_RATIO = 0.2
export const AUTO_BATTLE_DAILY_COIN_CAP = 1500

// Equipment (phase 3). Slot/grade data lives in equipment-data.ts, the enhance table in
// enhance-engine.ts.
export const EQUIPMENT_CAPACITY = 50
export const EQUIPMENT_BOX_PRICE = 120
// Chance (out of 10,000) that a manual adventure win drops a piece; auto-battle and expeditions never do.
export const EQUIPMENT_DROP_CHANCE_BP = 800
// Shop materials.
export const ENHANCE_STONE_PRICE = 40
export const PROTECT_SCROLL_GEM_PRICE = 5
// Expeditions bring home one enhance stone per this many minutes explored.
export const EXPEDITION_STONE_EVERY_MINUTES = 60
