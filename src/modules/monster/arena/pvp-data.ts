import { EnumMonsterLine, EnumMonsterStage } from '../../../db/entities/monster.entity'
import { arenaSpecOfFighter, scaleArenaSpec } from './arena-fighter'
import { IFighter } from '../battle/battle-stats'
import { PVP_SEASON_MIN_FIGHTS } from '../core/monster-rules'
import { scaleStats, STAGE_BASE_STATS } from '../core/species-data'

// Only hatched adult-and-up monsters fight in the arena; opponents are always the same form.
export const PVP_STAGES = [
  EnumMonsterStage.ADULT,
  EnumMonsterStage.PERFECT,
  EnumMonsterStage.ULTIMATE,
]

// A merged Fused pet fights too: it is matched with other Fused defenders only, and until enough
// exist it meets the Ultimate rivals (the strongest form that has tuned NPCs).
export const isPvpStage = (stage: EnumMonsterStage) =>
  PVP_STAGES.includes(stage) || stage === EnumMonsterStage.FUSED

export const npcStageOf = (stage: string) =>
  stage === (EnumMonsterStage.FUSED as string) ? (EnumMonsterStage.ULTIMATE as string) : stage

export interface IPvpNpc {
  id: string
  stage: EnumMonsterStage
  // Fixed: an NPC's rating never moves, but the challenger's does.
  rating: number
  fighter: IFighter
  // % on the fighter's HP/ATK (and its square root on DEF) in the arena.
  arenaStrength: number
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

// Tuned (pvp-data.spec.ts) for the same 75% / 50% / 25% in the arena, against a mid-tier player:
// a well-cared pet in a full Standard craft set (epic +5), averaged over every line. The arena is
// what a challenger really fights, and gear is what the old (bare pet) numbers left out. The win
// rate falls about 2 points per point of strength, and the tiers differ in element and base
// stats (so the three numbers are not in order): retune with the fixture, never by hand.
const NPC_ARENA_STRENGTH: Record<string, number[]> = {
  [EnumMonsterStage.ADULT]: [301, 296, 314],
  [EnumMonsterStage.PERFECT]: [229, 231, 239],
  [EnumMonsterStage.ULTIMATE]: [194, 193, 218],
}

export const PVP_NPCS: IPvpNpc[] = PVP_STAGES.flatMap(stage =>
  NPC_TIERS.map((tier, index) => ({
    id: `npc:${stage}:${index}`,
    stage,
    rating: tier.rating,
    arenaStrength: NPC_ARENA_STRENGTH[stage][index],
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

export const getNpcArena = (npc: IPvpNpc) =>
  scaleArenaSpec(arenaSpecOfFighter(npc.fighter), npc.arenaStrength)

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
