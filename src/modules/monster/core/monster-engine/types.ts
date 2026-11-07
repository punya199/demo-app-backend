import {
  EnumMonsterDeathCause,
  EnumMonsterLine,
  EnumMonsterStage,
} from '../../../../db/entities/monster.entity'
import { EnumMonsterLogType } from '../../../../db/entities/monster-log.entity'
import { IPotential } from '../monster-potential'

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
  // Set only on a stored monster; fighters and snapshots carry it for other players' cards.
  nickname?: string | null
  // Rolled at hatch and kept for life; null = a monster from before potential existed.
  potential: IPotential | null
  speciesId: string
  stage: EnumMonsterStage
  fullness: number
  strength: number
  // Adventure stamina (0-MAX_STAMINA): regained over time, spent by adventure fights.
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
  // Unused since skip replaced auto-battle; kept so the column stays in sync.
  lastAutoBattleAt: Date | null
  lastMinigameAt: Date | null
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
