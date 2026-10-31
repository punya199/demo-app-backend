import { EnumMonsterLine, EnumMonsterStage } from '../../db/entities/monster.entity'
import { IFighter } from './battle-stats'
import { PVP_SEASON_MIN_FIGHTS } from './monster-rules'
import { scaleStats, STAGE_BASE_STATS } from './species-data'

// Only hatched adult-and-up monsters fight in the arena; opponents are always the same form.
export const PVP_STAGES = [
  EnumMonsterStage.ADULT,
  EnumMonsterStage.PERFECT,
  EnumMonsterStage.ULTIMATE,
]

export const isPvpStage = (stage: EnumMonsterStage) => PVP_STAGES.includes(stage)

export interface IPvpNpc {
  id: string
  stage: EnumMonsterStage
  // Fixed: an NPC's rating never moves, but the challenger's does.
  rating: number
  fighter: IFighter
}

// Three rivals per form, from weaker to stronger, so the arena is never empty even with few
// players. Their stats are the form's base stats scaled, at full health.
const NPC_TIERS = [
  { name: 'นักประลองเงา', emoji: '🥷', element: EnumMonsterLine.LEAF, rating: 900 },
  { name: 'จอมประลองเงา', emoji: '🧙', element: EnumMonsterLine.TIDE, rating: 1000 },
  { name: 'ราชาประลองเงา', emoji: '🤺', element: EnumMonsterLine.FLAME, rating: 1100 },
]

// Stat multipliers per form, tuned (pvp-data.spec.ts) so a well-cared monster of the same element
// wins about 75% / 50% / 25% against the 900 / 1000 / 1100 rival. Adults are fought at a lower
// scale because the form's stats stack with the care bonuses the least.
const NPC_STRENGTH: Record<string, number[]> = {
  [EnumMonsterStage.ADULT]: [1.15, 1.2, 1.25],
  [EnumMonsterStage.PERFECT]: [1.2, 1.225, 1.275],
  [EnumMonsterStage.ULTIMATE]: [1.2, 1.225, 1.275],
}

export const PVP_NPCS: IPvpNpc[] = PVP_STAGES.flatMap(stage =>
  NPC_TIERS.map((tier, index) => ({
    id: `npc:${stage}:${index}`,
    stage,
    rating: tier.rating,
    fighter: {
      name: tier.name,
      emoji: tier.emoji,
      element: tier.element,
      stats: scaleStats(STAGE_BASE_STATS[stage], NPC_STRENGTH[stage][index]),
      skill: { name: 'ท่าเงา', power: stage === EnumMonsterStage.ULTIMATE ? 1.8 : 1.6 },
    },
  }))
)

export const findPvpNpc = (opponentId: string) => PVP_NPCS.find(npc => npc.id === opponentId)

export interface ISeasonReward {
  // Best rank that gets this tier (inclusive); null = everyone who qualified.
  maxRank: number | null
  coin: number
  gem: number
  raidToken: number
}

export const PVP_SEASON_REWARDS: ISeasonReward[] = [
  { maxRank: 1, coin: 1000, gem: 30, raidToken: 20 },
  { maxRank: 3, coin: 600, gem: 20, raidToken: 12 },
  { maxRank: 10, coin: 300, gem: 10, raidToken: 6 },
  { maxRank: null, coin: 100, gem: 3, raidToken: 2 },
]

// Reward for a final rank among players with at least PVP_SEASON_MIN_FIGHTS fights.
export const getSeasonReward = (rank: number, fights: number) =>
  fights < PVP_SEASON_MIN_FIGHTS
    ? null
    : (PVP_SEASON_REWARDS.find(tier => tier.maxRank === null || rank <= tier.maxRank) ?? null)
