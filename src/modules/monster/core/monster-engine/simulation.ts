import {
  EnumMonsterDeathCause,
  EnumMonsterLine,
  EnumMonsterStage,
} from '../../../../db/entities/monster.entity'
import { EnumMonsterLogType } from '../../../../db/entities/monster-log.entity'
import { IPotential } from '../monster-potential'
import {
  DEATH_AFTER_HUNGRY_MINUTES,
  DEATH_AFTER_SICK_MINUTES,
  EXPEDITION_DRAIN_MULTIPLIER,
  EXPEDITION_MAX_MINUTES,
  HATCH_FULLNESS,
  HATCH_STRENGTH,
  getLifespanMinutes,
  MAX_POOPS,
  MAX_STAMINA,
  MAX_TICK_MINUTES,
  NEGLECT_FIRST_MISTAKE_MINUTES,
  NEGLECT_REPEAT_MISTAKE_MINUTES,
  ONLINE_EVOLUTION_MULTIPLIER,
  ONLINE_GRACE_MINUTES,
  ONLINE_STAMINA_REGEN_MULTIPLIER,
  STAGE_DURATION_MINUTES,
  STAGE_RATES,
  STAMINA_REGEN_PER_HOUR,
} from '../monster-rules'
import { IFarmEffects, NO_FARM_EFFECTS } from '../../farm/farm-data'
import { eggSpeciesId, getSpecies, IEvolutionRule, ISpecies } from '../species-data'
import { IMonsterEvent, IMonsterState, IMonsterStepResult } from './types'

const MINUTE_MS = 60 * 1000

export const createEgg = (
  line: EnumMonsterLine,
  now: Date,
  potential: IPotential | null = null
): IMonsterState => {
  const egg = getSpecies(eggSpeciesId(line))
  return {
    line,
    potential,
    speciesId: egg.id,
    stage: egg.stage,
    fullness: 0,
    strength: 0,
    stamina: MAX_STAMINA,
    weight: egg.minWeight,
    poops: 0,
    isSick: false,
    careMistakes: 0,
    trainCount: 0,
    wins: 0,
    losses: 0,
    poopMinutes: 0,
    hungryMinutes: 0,
    weakMinutes: 0,
    sickMinutes: 0,
    stageMinutes: 0,
    ageMinutes: 0,
    bornAt: now,
    lastTickAt: now,
    lastSeenAt: now,
    lastTrainedAt: null,
    lastAutoBattleAt: null,
    lastMinigameAt: null,
    expeditionAreaId: null,
    expeditionMinutes: 0,
    expeditionRate: 0,
    expeditionReturned: false,
    diedAt: null,
    deathCause: null,
  }
}

export const isEvolutionRuleMet = (rule: IEvolutionRule, state: IMonsterState) =>
  (rule.maxCareMistakes === undefined || state.careMistakes <= rule.maxCareMistakes) &&
  (rule.minTrainCount === undefined || state.trainCount >= rule.minTrainCount) &&
  (rule.minWins === undefined || state.wins >= rule.minWins)

export const pickEvolution = (species: ISpecies, state: IMonsterState): ISpecies | null => {
  const rule = species.evolutions.find(candidate => isEvolutionRuleMet(candidate, state))
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

// Out exploring and still collecting: not yet back home.
const isExploring = (state: IMonsterState) =>
  state.expeditionAreaId !== null && !state.expeditionReturned

const isOnlineAt = (state: IMonsterState, at: Date) =>
  !!state.lastSeenAt &&
  at.getTime() <= state.lastSeenAt.getTime() + ONLINE_GRACE_MINUTES * MINUTE_MS

const returnFromExpedition = (
  state: IMonsterState,
  reason: 'time' | 'unwell',
  at: Date,
  events: IMonsterEvent[]
) => {
  state.expeditionReturned = true
  events.push({
    type: EnumMonsterLogType.ACTION,
    at,
    payload: { action: 'expedition_return', areaId: state.expeditionAreaId, reason },
  })
}

// Advances the state by one game minute ending at `at`.
const step = (
  state: IMonsterState,
  at: Date,
  events: IMonsterEvent[],
  fullnessDrain: number,
  poopRate: number,
  farm: IFarmEffects
) => {
  const isOnline = isOnlineAt(state, at)
  const duration = STAGE_DURATION_MINUTES[state.stage]
  const previousStageMinutes = state.stageMinutes
  state.stageMinutes += isOnline ? ONLINE_EVOLUTION_MULTIPLIER : 1
  // Evolution is decided once, on the minute stage progress crosses the stage's duration.
  const isStageTimeUp =
    duration !== null && previousStageMinutes < duration && state.stageMinutes >= duration

  if (state.stage === EnumMonsterStage.EGG) {
    if (isStageTimeUp) {
      evolve(state, pickEvolution(getSpecies(state.speciesId), state)!, at, events)
    }
    return
  }

  state.ageMinutes += 1

  state.stamina = Math.min(
    MAX_STAMINA,
    state.stamina + (STAMINA_REGEN_PER_HOUR / 60) * (isOnline ? ONLINE_STAMINA_REGEN_MULTIPLIER : 1)
  )

  const rates = STAGE_RATES[state.stage]
  const careDrain = isExploring(state) ? EXPEDITION_DRAIN_MULTIPLIER : 1
  state.fullness = Math.max(0, state.fullness - (careDrain * fullnessDrain) / rates.fullnessMinutes)
  state.strength = Math.max(
    0,
    state.strength - (careDrain * farm.strengthDrain) / rates.strengthMinutes
  )

  // Nothing piles up at home while the monster is away.
  if (!isExploring(state)) {
    state.poopMinutes += 1
  }
  if (state.poopMinutes >= Math.ceil(rates.poopEveryMinutes / poopRate)) {
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
    if (state.hungryMinutes === farm.sickAfterHungryMinutes) {
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

  if (state.isSick) {
    state.sickMinutes += 1
    if (state.sickMinutes >= DEATH_AFTER_SICK_MINUTES) {
      die(state, EnumMonsterDeathCause.SICKNESS, at, events)
      return
    }
  }

  if (state.ageMinutes >= getLifespanMinutes(state.stage)) {
    die(state, EnumMonsterDeathCause.OLD_AGE, at, events)
    return
  }

  // A minute only counts while the monster is healthy; otherwise it heads home with what it has.
  if (isExploring(state)) {
    if (state.isSick || state.fullness <= 0) {
      returnFromExpedition(state, 'unwell', at, events)
    } else {
      state.expeditionMinutes += 1
      if (state.expeditionMinutes >= EXPEDITION_MAX_MINUTES) {
        returnFromExpedition(state, 'time', at, events)
      }
    }
  }

  if (isStageTimeUp) {
    const next = pickEvolution(getSpecies(state.speciesId), state)
    if (next) {
      evolve(state, next, at, events)
    }
  }
}

// Replays every whole minute between lastTickAt and now. Leftover seconds stay pending for the
// next tick, so calling this often never loses or double-counts time.
// `fullnessDrain` scales how fast fullness drops (trainer passives and gear lower it); `poopRate`
// scales how often it poops (gear can lower it). `farm` carries the Farm furniture effects (drain,
// poop rate and the hunger-to-sick threshold, see farm-data.ts); it defaults to no furniture.
export const tick = (
  current: IMonsterState,
  now: Date,
  fullnessDrain = 1,
  poopRate = 1,
  farm: IFarmEffects = NO_FARM_EFFECTS
): IMonsterStepResult => {
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
    step(state, new Date(start + minute * MINUTE_MS), events, fullnessDrain, poopRate, farm)
  }
  state.lastTickAt = new Date(start + elapsedMinutes * MINUTE_MS)
  return { state, events }
}

export interface IEvolutionProgress {
  // null once the monster is in a final form (or dead).
  durationMinutes: number | null
  progressMinutes: number
  // Real minutes left offline; online the time is divided by onlineMultiplier.
  remainingMinutes: number | null
  onlineMultiplier: number
  // The form it would become if its time were up right now (null = would stay as it is).
  nextSpeciesId: string | null
  rules: (IEvolutionRule & { met: boolean })[]
  lifespanRemainingMinutes: number
}

export const getEvolutionProgress = (state: IMonsterState): IEvolutionProgress => {
  const species = getSpecies(state.speciesId)
  const duration = state.diedAt ? null : STAGE_DURATION_MINUTES[state.stage]
  const isWaiting = duration !== null && state.stageMinutes < duration
  return {
    durationMinutes: duration,
    progressMinutes: state.stageMinutes,
    remainingMinutes: isWaiting ? duration - state.stageMinutes : null,
    onlineMultiplier: ONLINE_EVOLUTION_MULTIPLIER,
    nextSpeciesId: isWaiting ? (pickEvolution(species, state)?.id ?? null) : null,
    rules: species.evolutions.map(rule => ({ ...rule, met: isEvolutionRuleMet(rule, state) })),
    lifespanRemainingMinutes: Math.max(0, getLifespanMinutes(state.stage) - state.ageMinutes),
  }
}
