import { EnumMonsterStage } from '../../../../db/entities/monster.entity'
import { EnumMonsterLogType } from '../../../../db/entities/monster-log.entity'
import {
  ADVENTURE_SKIP_MAX_RUNS,
  ADVENTURE_STAMINA_COST,
  BATTLE_WEIGHT_LOSS,
  DIET_TEA_WEIGHT_LOSS,
  FEED_WEIGHT_GAIN,
  MAX_HEARTS,
  MAX_STAMINA,
  MINIGAME_COOLDOWN_MS,
  MINIGAME_STAMINA_REWARDS,
  PREMIUM_MEAT_FULLNESS,
  PREMIUM_MEAT_WEIGHT_GAIN,
  PROTEIN_STRENGTH,
  PROTEIN_WEIGHT_GAIN,
  TRAIN_COOLDOWN_MS,
  TRAIN_WEIGHT_LOSS,
  VITAMIN_WEIGHT_GAIN,
} from '../monster-rules'
import { EnumShopItemId } from '../../equipment/shop-data'
import { getSpecies } from '../species-data'
import { EnumMonsterAction, IMonsterState, IMonsterStepResult, MonsterRuleError } from './types'

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
export const assertCanBattle = (state: IMonsterState) => {
  assertHatchedAndAlive(state)
  if (state.isSick) {
    throw new MonsterRuleError('Monster is sick')
  }
  if (state.expeditionAreaId) {
    throw new MonsterRuleError('Monster is on an expedition')
  }
}

// Adventure fights (fought or skipped) need one fight's worth of stamina; other modes don't use it.
export const assertCanAdventure = (state: IMonsterState, cost = ADVENTURE_STAMINA_COST) => {
  assertCanBattle(state)
  if (state.stamina < cost) {
    throw new MonsterRuleError('Not enough stamina')
  }
}

// The result of an adventure fight: it costs stamina and counts toward the lifetime wins/losses
// that evolution rules read.
export const applyBattleOutcome = (
  current: IMonsterState,
  won: boolean,
  payload: Record<string, unknown>,
  now: Date,
  staminaCost = ADVENTURE_STAMINA_COST
): IMonsterStepResult => {
  assertCanAdventure(current, staminaCost)
  const state = { ...current }
  const species = getSpecies(state.speciesId)
  state.stamina = Math.max(0, state.stamina - staminaCost)
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
        payload: { ...payload, won },
      },
    ],
  }
}

// Skip: `runs` wins of an already-cleared stage without fighting. Costs `staminaCost` per run (all
// up front, or nothing) and counts like that many won fights: wins, weight, one event per run.
export const applyAdventureSkip = (
  current: IMonsterState,
  stageId: string,
  runs: number,
  rewardPerRun: number,
  now: Date,
  staminaCost = ADVENTURE_STAMINA_COST
): IMonsterStepResult => {
  if (!Number.isInteger(runs) || runs < 1 || runs > ADVENTURE_SKIP_MAX_RUNS) {
    throw new MonsterRuleError(`Skip 1 to ${ADVENTURE_SKIP_MAX_RUNS} runs at a time`)
  }
  assertCanAdventure(current, staminaCost * runs)
  const state = { ...current }
  const species = getSpecies(state.speciesId)
  state.stamina -= staminaCost * runs
  state.weight = Math.max(species.minWeight, state.weight - BATTLE_WEIGHT_LOSS * runs)
  state.wins += runs
  return {
    state,
    events: Array.from({ length: runs }, () => ({
      type: EnumMonsterLogType.BATTLE,
      at: now,
      payload: { stageId, won: true, skip: true, reward: rewardPerRun },
    })),
  }
}

// An arena or Boss Raid fight costs what a normal one does but does not touch `wins`/`losses`:
// those feed the evolution rules, which are meant to be earned in the adventure. Ratings and raid
// progress are tracked apart.
export const applyPvpOutcome = (
  current: IMonsterState,
  won: boolean,
  payload: Record<string, unknown>,
  now: Date,
  mode: 'pvp' | 'raid' | 'world_boss' = 'pvp'
): IMonsterStepResult => {
  assertCanBattle(current)
  const state = { ...current }
  const species = getSpecies(state.speciesId)
  state.weight = Math.max(species.minWeight, state.weight - BATTLE_WEIGHT_LOSS)
  return {
    state,
    events: [{ type: EnumMonsterLogType.BATTLE, at: now, payload: { ...payload, won, mode } }],
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
