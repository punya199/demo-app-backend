import { EnumMonsterStage } from '../../db/entities/monster.entity'

// Every tunable number of the V-Pet rules lives here. Durations are in game minutes - the engine
// simulates one minute at a time (see monster-engine.ts).

export const MAX_HEARTS = 4
export const MAX_POOPS = 4

// How long a monster stays in each stage before trying to evolve. null = never evolves further.
// PERFECT does try once at 72h; when no evolution matches, it simply stays PERFECT until it dies.
export const STAGE_DURATION_MINUTES: Record<EnumMonsterStage, number | null> = {
  [EnumMonsterStage.EGG]: 5,
  [EnumMonsterStage.BABY_1]: 60,
  [EnumMonsterStage.BABY_2]: 12 * 60,
  [EnumMonsterStage.ADULT]: 36 * 60,
  [EnumMonsterStage.PERFECT]: 72 * 60,
  [EnumMonsterStage.ULTIMATE]: null,
}

interface IStageRates {
  // Minutes for one heart of fullness/strength to drain while awake.
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
export const LIFESPAN_MINUTES = 10 * 24 * 60

// Fixed sleep schedule in Thai time (UTC+7, no DST). Lights left on this long after falling
// asleep count one care mistake per night.
export const TIMEZONE_OFFSET_MINUTES = 7 * 60
export const SLEEP_START_MINUTE_OF_DAY = 22 * 60
export const SLEEP_END_MINUTE_OF_DAY = 7 * 60
export const LIGHTS_ON_MISTAKE_MINUTES = 30

export const TRAIN_COOLDOWN_MS = 60 * 1000
export const TRAIN_WEIGHT_LOSS = 2
export const FEED_WEIGHT_GAIN = 1
export const VITAMIN_WEIGHT_GAIN = 2

// Safety cap for one tick - a living monster dies of starvation or old age long before this.
export const MAX_TICK_MINUTES = 30 * 24 * 60
