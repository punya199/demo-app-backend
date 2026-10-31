import {
  EnumMonsterDeathCause,
  EnumMonsterLine,
  EnumMonsterStage,
} from '../../db/entities/monster.entity'
import { EnumMonsterLogType } from '../../db/entities/monster-log.entity'
import {
  AUTO_BATTLE_STAMINA_COST,
  BATTLE_STAMINA_COST,
  BATTLE_WEIGHT_LOSS,
  DEATH_AFTER_HUNGRY_MINUTES,
  DEATH_AFTER_SICK_MINUTES,
  DIET_TEA_WEIGHT_LOSS,
  EXPEDITION_DRAIN_MULTIPLIER,
  EXPEDITION_MAX_MINUTES,
  FEED_WEIGHT_GAIN,
  HATCH_FULLNESS,
  HATCH_STRENGTH,
  LIFESPAN_MINUTES,
  MAX_HEARTS,
  MAX_POOPS,
  MAX_STAMINA,
  MAX_TICK_MINUTES,
  MINIGAME_COOLDOWN_MS,
  MINIGAME_STAMINA_REWARDS,
  NEGLECT_FIRST_MISTAKE_MINUTES,
  NEGLECT_REPEAT_MISTAKE_MINUTES,
  AUTO_BATTLE_COOLDOWN_MS,
  ONLINE_EVOLUTION_MULTIPLIER,
  ONLINE_GRACE_MINUTES,
  PREMIUM_MEAT_FULLNESS,
  PREMIUM_MEAT_WEIGHT_GAIN,
  PROTEIN_STRENGTH,
  PROTEIN_WEIGHT_GAIN,
  SICK_AFTER_HUNGRY_MINUTES,
  STAGE_DURATION_MINUTES,
  STAGE_RATES,
  STAMINA_RECOVERY_ONLINE_MULTIPLIER,
  STAMINA_RECOVERY_PER_MINUTE,
  TRAIN_COOLDOWN_MS,
  TRAIN_WEIGHT_LOSS,
  VITAMIN_WEIGHT_GAIN,
} from './monster-rules'
import { EnumShopItemId } from './shop-data'
import { eggSpeciesId, getSpecies, IEvolutionRule, ISpecies } from './species-data'

// Pure V-Pet rules: no DB, no Nest. MonsterService loads a row, runs tick()/applyAction() on it
// inside a locked transaction, then saves the returned state and writes the events as logs.

export enum EnumMonsterAction {
  FEED = 'feed',
  VITAMIN = 'vitamin',
  TRAIN = 'train',
  CLEAN = 'clean',
  MEDICINE = 'medicine',
}

export interface IMonsterState {
  line: EnumMonsterLine
  speciesId: string
  stage: EnumMonsterStage
  fullness: number
  strength: number
  stamina: number
  weight: number
  poops: number
  isSick: boolean
  careMistakes: number
  trainCount: number
  wins: number
  losses: number
  poopMinutes: number
  hungryMinutes: number
  weakMinutes: number
  sickMinutes: number
  // Stage progress toward the next evolution; online minutes add ONLINE_EVOLUTION_MULTIPLIER.
  stageMinutes: number
  ageMinutes: number
  bornAt: Date
  lastTickAt: Date
  // Last request from the owner; minutes shortly after it count as online.
  lastSeenAt: Date | null
  lastTrainedAt: Date | null
  lastMinigameAt: Date | null
  lastAutoBattleAt: Date | null
  expeditionAreaId: string | null
  expeditionMinutes: number
  expeditionRate: number
  expeditionReturned: boolean
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

export const createEgg = (line: EnumMonsterLine, now: Date): IMonsterState => {
  const egg = getSpecies(eggSpeciesId(line))
  return {
    line,
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
    lastMinigameAt: null,
    lastAutoBattleAt: null,
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
const step = (state: IMonsterState, at: Date, events: IMonsterEvent[]) => {
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

  const rates = STAGE_RATES[state.stage]
  const careDrain = isExploring(state) ? EXPEDITION_DRAIN_MULTIPLIER : 1
  state.fullness = Math.max(0, state.fullness - careDrain / rates.fullnessMinutes)
  state.strength = Math.max(0, state.strength - careDrain / rates.strengthMinutes)
  // Also while exploring: the monster rests between fights wherever it is.
  state.stamina = Math.min(
    MAX_STAMINA,
    state.stamina +
      STAMINA_RECOVERY_PER_MINUTE * (isOnline ? STAMINA_RECOVERY_ONLINE_MULTIPLIER : 1)
  )

  // Nothing piles up at home while the monster is away.
  if (!isExploring(state)) {
    state.poopMinutes += 1
  }
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
    lifespanRemainingMinutes: Math.max(0, LIFESPAN_MINUTES - state.ageMinutes),
  }
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
  const species = getSpecies(state.speciesId)

  switch (action) {
    case EnumMonsterAction.FEED:
      state.fullness = Math.min(MAX_HEARTS, state.fullness + 1)
      state.weight += FEED_WEIGHT_GAIN
      state.hungryMinutes = 0
      break
    case EnumMonsterAction.VITAMIN:
      state.strength = Math.min(MAX_HEARTS, state.strength + 1)
      state.weight += VITAMIN_WEIGHT_GAIN
      state.weakMinutes = 0
      break
    case EnumMonsterAction.TRAIN:
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
  }

  return {
    state,
    events: [{ type: EnumMonsterLogType.ACTION, at: now, payload: { action } }],
  }
}

// Throws when the monster can't fight right now. Expects a state already ticked up to `now`.
// Running out of stamina doesn't stop a fight - it halves the monster's stats (battle-stats.ts).
export const assertCanBattle = (state: IMonsterState) => {
  assertHatchedAndAlive(state)
  if (state.isSick) {
    throw new MonsterRuleError('Monster is sick')
  }
  if (state.expeditionAreaId) {
    throw new MonsterRuleError('Monster is on an expedition')
  }
}

export const applyBattleOutcome = (
  current: IMonsterState,
  won: boolean,
  payload: Record<string, unknown>,
  now: Date,
  isAuto = false
): IMonsterStepResult => {
  assertCanBattle(current)
  const state = { ...current }
  const species = getSpecies(state.speciesId)
  state.stamina = Math.max(
    0,
    state.stamina - (isAuto ? AUTO_BATTLE_STAMINA_COST : BATTLE_STAMINA_COST)
  )
  if (isAuto) {
    state.lastAutoBattleAt = now
  }
  state.weight = Math.max(species.minWeight, state.weight - BATTLE_WEIGHT_LOSS)
  if (won) {
    state.wins += 1
  } else {
    state.losses += 1
  }
  return {
    state,
    events: [
      {
        type: EnumMonsterLogType.BATTLE,
        at: now,
        payload: { ...payload, won, ...(isAuto && { isAuto }) },
      },
    ],
  }
}

// The mini-game's score is reported by the client, so the reward is capped and rate-limited.
export const applyMinigame = (
  current: IMonsterState,
  hits: number,
  now: Date
): IMonsterStepResult => {
  const state = { ...current }
  assertHatchedAndAlive(state)
  if (
    state.lastMinigameAt &&
    now.getTime() - state.lastMinigameAt.getTime() < MINIGAME_COOLDOWN_MS
  ) {
    throw new MonsterRuleError('Mini-game is not ready yet')
  }
  const reward = MINIGAME_STAMINA_REWARDS[hits]
  if (reward === undefined) {
    throw new MonsterRuleError('Invalid mini-game score')
  }
  state.stamina = Math.min(MAX_STAMINA, state.stamina + reward)
  state.lastMinigameAt = now
  return {
    state,
    events: [
      { type: EnumMonsterLogType.ACTION, at: now, payload: { action: 'minigame', hits, reward } },
    ],
  }
}

// An arena fight costs what a normal one does but does not touch `wins`/`losses`: those feed the
// evolution rules, which are meant to be earned in the adventure. Ratings are tracked apart.
export const applyPvpOutcome = (
  current: IMonsterState,
  won: boolean,
  payload: Record<string, unknown>,
  now: Date
): IMonsterStepResult => {
  assertCanBattle(current)
  const state = { ...current }
  const species = getSpecies(state.speciesId)
  state.stamina = Math.max(0, state.stamina - BATTLE_STAMINA_COST)
  state.weight = Math.max(species.minWeight, state.weight - BATTLE_WEIGHT_LOSS)
  return {
    state,
    events: [
      { type: EnumMonsterLogType.BATTLE, at: now, payload: { ...payload, won, mode: 'pvp' } },
    ],
  }
}

// Auto-battle is rate-limited here; the per-day coin cap needs the wallet history (AdventureService).
export const assertAutoBattleReady = (state: IMonsterState, now: Date) => {
  if (
    state.lastAutoBattleAt &&
    now.getTime() - state.lastAutoBattleAt.getTime() < AUTO_BATTLE_COOLDOWN_MS
  ) {
    throw new MonsterRuleError('Auto-battle is not ready yet')
  }
}

// `rate` is coins/hour, worked out by the caller from the area and the monster's power.
export const startExpedition = (
  current: IMonsterState,
  areaId: string,
  rate: number,
  now: Date
): IMonsterStepResult => {
  const state = { ...current }
  assertHatchedAndAlive(state)
  if (state.expeditionAreaId) {
    throw new MonsterRuleError('Monster is already on an expedition')
  }
  if (state.isSick || state.fullness <= 0) {
    throw new MonsterRuleError('Monster is too unwell to explore')
  }
  state.expeditionAreaId = areaId
  state.expeditionMinutes = 0
  state.expeditionRate = rate
  state.expeditionReturned = false
  return {
    state,
    events: [
      { type: EnumMonsterLogType.ACTION, at: now, payload: { action: 'expedition_start', areaId } },
    ],
  }
}

export const claimExpedition = (
  current: IMonsterState,
  reward: { coins: number; items: string[] },
  now: Date
): IMonsterStepResult => {
  const state = { ...current }
  assertHatchedAndAlive(state)
  if (!state.expeditionAreaId) {
    throw new MonsterRuleError('Monster is not on an expedition')
  }
  const payload = {
    action: 'expedition_claim',
    areaId: state.expeditionAreaId,
    minutes: state.expeditionMinutes,
    ...reward,
  }
  state.expeditionAreaId = null
  state.expeditionMinutes = 0
  state.expeditionRate = 0
  state.expeditionReturned = false
  return { state, events: [{ type: EnumMonsterLogType.ACTION, at: now, payload }] }
}

export const refillStamina = (current: IMonsterState, now: Date): IMonsterStepResult => {
  const state = { ...current }
  assertHatchedAndAlive(state)
  if (state.stamina >= MAX_STAMINA) {
    throw new MonsterRuleError('Stamina is already full')
  }
  state.stamina = MAX_STAMINA
  return {
    state,
    events: [{ type: EnumMonsterLogType.ACTION, at: now, payload: { action: 'stamina_refill' } }],
  }
}

// Shop items are eaten/used on purchase.
export const applyShopItem = (
  current: IMonsterState,
  itemId: EnumShopItemId,
  now: Date
): IMonsterStepResult => {
  const state = { ...current }
  assertHatchedAndAlive(state)
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
