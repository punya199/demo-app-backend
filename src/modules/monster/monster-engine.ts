import {
  EnumMonsterDeathCause,
  EnumMonsterLine,
  EnumMonsterStage,
} from '../../db/entities/monster.entity'
import { EnumMonsterLogType } from '../../db/entities/monster-log.entity'
import {
  BATTLE_STRENGTH_COST,
  BATTLE_WEIGHT_LOSS,
  DEATH_AFTER_HUNGRY_MINUTES,
  DIET_TEA_WEIGHT_LOSS,
  DEATH_AFTER_SICK_MINUTES,
  FEED_WEIGHT_GAIN,
  HATCH_FULLNESS,
  HATCH_STRENGTH,
  LIFESPAN_MINUTES,
  LIGHTS_ON_MISTAKE_MINUTES,
  MAX_HEARTS,
  MAX_POOPS,
  MAX_TICK_MINUTES,
  NEGLECT_FIRST_MISTAKE_MINUTES,
  NEGLECT_REPEAT_MISTAKE_MINUTES,
  PREMIUM_MEAT_FULLNESS,
  PREMIUM_MEAT_WEIGHT_GAIN,
  PROTEIN_STRENGTH,
  PROTEIN_WEIGHT_GAIN,
  SICK_AFTER_HUNGRY_MINUTES,
  SLEEP_END_MINUTE_OF_DAY,
  SLEEP_START_MINUTE_OF_DAY,
  STAGE_DURATION_MINUTES,
  STAGE_RATES,
  TIMEZONE_OFFSET_MINUTES,
  TRAIN_COOLDOWN_MS,
  TRAIN_WEIGHT_LOSS,
  VITAMIN_WEIGHT_GAIN,
} from './monster-rules'
import { EnumShopItemId } from './shop-data'
import { eggSpeciesId, getSpecies, ISpecies } from './species-data'

// Pure V-Pet rules: no DB, no Nest. MonsterService loads a row, runs tick()/applyAction() on it
// inside a locked transaction, then saves the returned state and writes the events as logs.

export enum EnumMonsterAction {
  FEED = 'feed',
  VITAMIN = 'vitamin',
  TRAIN = 'train',
  CLEAN = 'clean',
  MEDICINE = 'medicine',
  LIGHTS = 'lights',
}

export interface IMonsterState {
  line: EnumMonsterLine
  speciesId: string
  stage: EnumMonsterStage
  fullness: number
  strength: number
  weight: number
  poops: number
  isSick: boolean
  lightsOn: boolean
  careMistakes: number
  trainCount: number
  wins: number
  losses: number
  poopMinutes: number
  hungryMinutes: number
  weakMinutes: number
  sickMinutes: number
  sleepLightMinutes: number
  stageMinutes: number
  ageMinutes: number
  bornAt: Date
  lastTickAt: Date
  lastTrainedAt: Date | null
  diedAt: Date | null
  deathCause: EnumMonsterDeathCause | null
}

export interface IMonsterEvent {
  type: EnumMonsterLogType
  at: Date
  payload: Record<string, unknown>
}

export interface IMonsterStepResult {
  state: IMonsterState
  events: IMonsterEvent[]
}

// Thrown for an action the rules don't allow right now; the service maps it to a 400.
export class MonsterRuleError extends Error {}

const MINUTE_MS = 60 * 1000

export const isAsleepAt = (at: Date) => {
  const minuteOfDay =
    (((Math.floor(at.getTime() / MINUTE_MS) + TIMEZONE_OFFSET_MINUTES) % 1440) + 1440) % 1440
  return minuteOfDay >= SLEEP_START_MINUTE_OF_DAY || minuteOfDay < SLEEP_END_MINUTE_OF_DAY
}

export const isSleeping = (state: IMonsterState, at: Date) =>
  state.stage !== EnumMonsterStage.EGG && !state.diedAt && isAsleepAt(at)

export const createEgg = (line: EnumMonsterLine, now: Date): IMonsterState => {
  const egg = getSpecies(eggSpeciesId(line))
  return {
    line,
    speciesId: egg.id,
    stage: egg.stage,
    fullness: 0,
    strength: 0,
    weight: egg.minWeight,
    poops: 0,
    isSick: false,
    lightsOn: true,
    careMistakes: 0,
    trainCount: 0,
    wins: 0,
    losses: 0,
    poopMinutes: 0,
    hungryMinutes: 0,
    weakMinutes: 0,
    sickMinutes: 0,
    sleepLightMinutes: 0,
    stageMinutes: 0,
    ageMinutes: 0,
    bornAt: now,
    lastTickAt: now,
    lastTrainedAt: null,
    diedAt: null,
    deathCause: null,
  }
}

export const pickEvolution = (species: ISpecies, state: IMonsterState): ISpecies | null => {
  const rule = species.evolutions.find(
    candidate =>
      (candidate.maxCareMistakes === undefined ||
        state.careMistakes <= candidate.maxCareMistakes) &&
      (candidate.minTrainCount === undefined || state.trainCount >= candidate.minTrainCount) &&
      (candidate.minWins === undefined || state.wins >= candidate.minWins)
  )
  return rule ? getSpecies(rule.to) : null
}

// True on the minutes a neglect counter (fullness/strength stuck at 0) should cost a care mistake.
const isNeglectMistakeMinute = (minutes: number) =>
  minutes === NEGLECT_FIRST_MISTAKE_MINUTES ||
  (minutes > NEGLECT_FIRST_MISTAKE_MINUTES &&
    (minutes - NEGLECT_FIRST_MISTAKE_MINUTES) % NEGLECT_REPEAT_MISTAKE_MINUTES === 0)

const evolve = (state: IMonsterState, to: ISpecies, at: Date, events: IMonsterEvent[]) => {
  const from = state.speciesId
  const isHatching = state.stage === EnumMonsterStage.EGG
  state.speciesId = to.id
  state.stage = to.stage
  state.careMistakes = 0
  state.trainCount = 0
  state.stageMinutes = 0
  state.weight = Math.max(state.weight, to.minWeight)
  if (isHatching) {
    state.fullness = HATCH_FULLNESS
    state.strength = HATCH_STRENGTH
  }
  events.push({ type: EnumMonsterLogType.EVOLVE, at, payload: { from, to: to.id } })
}

const addCareMistake = (
  state: IMonsterState,
  reason: string,
  at: Date,
  events: IMonsterEvent[]
) => {
  state.careMistakes += 1
  events.push({ type: EnumMonsterLogType.CARE_MISTAKE, at, payload: { reason } })
}

const becomeSick = (state: IMonsterState, reason: string, at: Date, events: IMonsterEvent[]) => {
  if (state.isSick) {
    return
  }
  state.isSick = true
  state.sickMinutes = 0
  events.push({ type: EnumMonsterLogType.SICK, at, payload: { reason } })
}

const die = (
  state: IMonsterState,
  cause: EnumMonsterDeathCause,
  at: Date,
  events: IMonsterEvent[]
) => {
  state.diedAt = at
  state.deathCause = cause
  events.push({ type: EnumMonsterLogType.DEATH, at, payload: { cause } })
}

// Advances the state by one game minute ending at `at`.
const step = (state: IMonsterState, at: Date, events: IMonsterEvent[]) => {
  state.stageMinutes += 1

  if (state.stage === EnumMonsterStage.EGG) {
    if (state.stageMinutes >= STAGE_DURATION_MINUTES[EnumMonsterStage.EGG]!) {
      evolve(state, pickEvolution(getSpecies(state.speciesId), state)!, at, events)
    }
    return
  }

  state.ageMinutes += 1
  const asleep = isAsleepAt(at)

  if (asleep) {
    if (state.lightsOn) {
      state.sleepLightMinutes += 1
      if (state.sleepLightMinutes === LIGHTS_ON_MISTAKE_MINUTES) {
        addCareMistake(state, 'lights_on', at, events)
      }
    }
  } else {
    if (isAsleepAt(new Date(at.getTime() - MINUTE_MS))) {
      // Just woke up: lights come back on by themselves and the per-night counter resets.
      state.lightsOn = true
      state.sleepLightMinutes = 0
    }

    const rates = STAGE_RATES[state.stage]
    state.fullness = Math.max(0, state.fullness - 1 / rates.fullnessMinutes)
    state.strength = Math.max(0, state.strength - 1 / rates.strengthMinutes)

    state.poopMinutes += 1
    if (state.poopMinutes >= rates.poopEveryMinutes) {
      state.poopMinutes = 0
      if (state.poops < MAX_POOPS) {
        state.poops += 1
        if (state.poops === MAX_POOPS) {
          becomeSick(state, 'dirty', at, events)
        }
      }
    }

    if (state.fullness <= 0) {
      state.hungryMinutes += 1
      if (isNeglectMistakeMinute(state.hungryMinutes)) {
        addCareMistake(state, 'hungry', at, events)
      }
      if (state.hungryMinutes === SICK_AFTER_HUNGRY_MINUTES) {
        becomeSick(state, 'hungry', at, events)
      }
      if (state.hungryMinutes >= DEATH_AFTER_HUNGRY_MINUTES) {
        die(state, EnumMonsterDeathCause.STARVATION, at, events)
        return
      }
    } else {
      state.hungryMinutes = 0
    }

    if (state.strength <= 0) {
      state.weakMinutes += 1
      if (isNeglectMistakeMinute(state.weakMinutes)) {
        addCareMistake(state, 'weak', at, events)
      }
    } else {
      state.weakMinutes = 0
    }
  }

  if (state.isSick) {
    state.sickMinutes += 1
    if (state.sickMinutes >= DEATH_AFTER_SICK_MINUTES) {
      die(state, EnumMonsterDeathCause.SICKNESS, at, events)
      return
    }
  }

  if (state.ageMinutes >= LIFESPAN_MINUTES) {
    die(state, EnumMonsterDeathCause.OLD_AGE, at, events)
    return
  }

  // Evolution is decided once, at the exact minute the stage's time is up.
  if (state.stageMinutes === STAGE_DURATION_MINUTES[state.stage]) {
    const next = pickEvolution(getSpecies(state.speciesId), state)
    if (next) {
      evolve(state, next, at, events)
    }
  }
}

// Replays every whole minute between lastTickAt and now. Leftover seconds stay pending for the
// next tick, so calling this often never loses or double-counts time.
export const tick = (current: IMonsterState, now: Date): IMonsterStepResult => {
  const state = { ...current }
  const events: IMonsterEvent[] = []
  if (state.diedAt) {
    return { state, events }
  }

  const elapsedMinutes = Math.floor((now.getTime() - state.lastTickAt.getTime()) / MINUTE_MS)
  if (elapsedMinutes <= 0) {
    return { state, events }
  }

  const start = state.lastTickAt.getTime()
  const simulated = Math.min(elapsedMinutes, MAX_TICK_MINUTES)
  for (let minute = 1; minute <= simulated && !state.diedAt; minute++) {
    step(state, new Date(start + minute * MINUTE_MS), events)
  }
  state.lastTickAt = new Date(start + elapsedMinutes * MINUTE_MS)
  return { state, events }
}

const assertHatchedAndAlive = (state: IMonsterState) => {
  if (state.diedAt) {
    throw new MonsterRuleError('Monster is no longer alive')
  }
  if (state.stage === EnumMonsterStage.EGG) {
    throw new MonsterRuleError('The egg has not hatched yet')
  }
}

// Expects a state already ticked up to `now`.
export const applyAction = (
  current: IMonsterState,
  action: EnumMonsterAction,
  now: Date
): IMonsterStepResult => {
  const state = { ...current }
  assertHatchedAndAlive(state)
  const asleep = isAsleepAt(now)
  const species = getSpecies(state.speciesId)

  switch (action) {
    case EnumMonsterAction.FEED:
      if (asleep) {
        throw new MonsterRuleError('Monster is asleep')
      }
      state.fullness = Math.min(MAX_HEARTS, state.fullness + 1)
      state.weight += FEED_WEIGHT_GAIN
      state.hungryMinutes = 0
      break
    case EnumMonsterAction.VITAMIN:
      if (asleep) {
        throw new MonsterRuleError('Monster is asleep')
      }
      state.strength = Math.min(MAX_HEARTS, state.strength + 1)
      state.weight += VITAMIN_WEIGHT_GAIN
      state.weakMinutes = 0
      break
    case EnumMonsterAction.TRAIN:
      if (asleep) {
        throw new MonsterRuleError('Monster is asleep')
      }
      if (state.isSick) {
        throw new MonsterRuleError('Monster is sick')
      }
      if (
        state.lastTrainedAt &&
        now.getTime() - state.lastTrainedAt.getTime() < TRAIN_COOLDOWN_MS
      ) {
        throw new MonsterRuleError('Monster is still resting from training')
      }
      state.strength = Math.min(MAX_HEARTS, state.strength + 1)
      state.weight = Math.max(species.minWeight, state.weight - TRAIN_WEIGHT_LOSS)
      state.weakMinutes = 0
      state.trainCount += 1
      state.lastTrainedAt = now
      break
    case EnumMonsterAction.CLEAN:
      state.poops = 0
      break
    case EnumMonsterAction.MEDICINE:
      if (!state.isSick) {
        throw new MonsterRuleError('Monster is not sick')
      }
      state.isSick = false
      state.sickMinutes = 0
      break
    case EnumMonsterAction.LIGHTS:
      state.lightsOn = !state.lightsOn
      break
  }

  return {
    state,
    events: [{ type: EnumMonsterLogType.ACTION, at: now, payload: { action } }],
  }
}

// Throws when the monster can't fight right now. Expects a state already ticked up to `now`.
export const assertCanBattle = (state: IMonsterState, now: Date) => {
  assertHatchedAndAlive(state)
  if (isAsleepAt(now)) {
    throw new MonsterRuleError('Monster is asleep')
  }
  if (state.isSick) {
    throw new MonsterRuleError('Monster is sick')
  }
  // Any partly-filled heart shows as a full one, so any strength left is enough to fight.
  if (state.strength <= 0) {
    throw new MonsterRuleError('Monster is too weak to fight')
  }
}

export const applyBattleOutcome = (
  current: IMonsterState,
  won: boolean,
  payload: Record<string, unknown>,
  now: Date
): IMonsterStepResult => {
  assertCanBattle(current, now)
  const state = { ...current }
  const species = getSpecies(state.speciesId)
  state.strength = Math.max(0, state.strength - BATTLE_STRENGTH_COST)
  state.weight = Math.max(species.minWeight, state.weight - BATTLE_WEIGHT_LOSS)
  if (won) {
    state.wins += 1
  } else {
    state.losses += 1
  }
  return {
    state,
    events: [{ type: EnumMonsterLogType.BATTLE, at: now, payload: { ...payload, won } }],
  }
}

// Shop items are eaten/used on purchase, so they follow the same awake/alive rules as feeding.
export const applyShopItem = (
  current: IMonsterState,
  itemId: EnumShopItemId,
  now: Date
): IMonsterStepResult => {
  const state = { ...current }
  assertHatchedAndAlive(state)
  if (isAsleepAt(now)) {
    throw new MonsterRuleError('Monster is asleep')
  }
  const species = getSpecies(state.speciesId)

  switch (itemId) {
    case EnumShopItemId.PREMIUM_MEAT:
      state.fullness = Math.min(MAX_HEARTS, state.fullness + PREMIUM_MEAT_FULLNESS)
      state.weight += PREMIUM_MEAT_WEIGHT_GAIN
      state.hungryMinutes = 0
      break
    case EnumShopItemId.PROTEIN:
      state.strength = Math.min(MAX_HEARTS, state.strength + PROTEIN_STRENGTH)
      state.weight += PROTEIN_WEIGHT_GAIN
      state.weakMinutes = 0
      break
    case EnumShopItemId.DIET_TEA:
      state.weight = Math.max(species.minWeight, state.weight - DIET_TEA_WEIGHT_LOSS)
      break
    case EnumShopItemId.TRAINING_MANUAL:
      state.trainCount += 1
      break
  }

  return {
    state,
    events: [{ type: EnumMonsterLogType.SHOP, at: now, payload: { itemId } }],
  }
}
