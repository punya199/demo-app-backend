import { EnumMonsterLine, EnumMonsterStage } from '../../db/entities/monster.entity'
import { IFighter } from './battle-stats'
import { EnumEquipmentGrade } from './equipment-data'
import { scaleStats, STAGE_BASE_STATS } from './species-data'

// Boss Raid: a solo fight (the normal 1-vs-1 engine, win within 20 rounds) against an element
// boss. Winning always drops one piece of that boss's set.

export enum EnumRaidDifficulty {
  NORMAL = 'normal',
  HARD = 'hard',
  NIGHTMARE = 'nightmare',
}

const STAGE_ORDER = [
  EnumMonsterStage.EGG,
  EnumMonsterStage.BABY_1,
  EnumMonsterStage.BABY_2,
  EnumMonsterStage.ADULT,
  EnumMonsterStage.PERFECT,
  EnumMonsterStage.ULTIMATE,
]

export const isStageAtLeast = (stage: EnumMonsterStage, minimum: EnumMonsterStage) =>
  STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(minimum)

export interface IRaidDifficulty {
  difficulty: EnumRaidDifficulty
  // The form needed to enter, and the form whose base stats the boss is scaled from.
  minStage: EnumMonsterStage
  // Stat multiplier on that form's base stats, tuned (raid-data.spec.ts) so a well-cared monster
  // of minStage wins about 70% / 50% / 30% of the time (averaged over the three lines), with no
  // set. Raid fights ignore the element triangle, otherwise a boss would be unbeatable for the
  // line it counters and every line could only collect two of the three sets.
  strength: number
  // Grade of the set piece a win drops.
  grade: EnumEquipmentGrade
  // Raid tokens for a win (doubled for the first win of each boss and difficulty).
  raidTokens: number
}

export const RAID_DIFFICULTIES: IRaidDifficulty[] = [
  {
    difficulty: EnumRaidDifficulty.NORMAL,
    minStage: EnumMonsterStage.ADULT,
    strength: 1.125,
    grade: EnumEquipmentGrade.RARE,
    raidTokens: 2,
  },
  {
    difficulty: EnumRaidDifficulty.HARD,
    minStage: EnumMonsterStage.PERFECT,
    strength: 1.21,
    grade: EnumEquipmentGrade.EPIC,
    raidTokens: 4,
  },
  {
    difficulty: EnumRaidDifficulty.NIGHTMARE,
    minStage: EnumMonsterStage.ULTIMATE,
    strength: 1.26,
    grade: EnumEquipmentGrade.LEGENDARY,
    raidTokens: 8,
  },
]

export const RAID_FIRST_CLEAR_MULTIPLIER = 2
export const RAID_BOSS_SKILL_POWER = 1.8

export const findRaidDifficulty = (difficulty: string) =>
  RAID_DIFFICULTIES.find(entry => (entry.difficulty as string) === difficulty)

export interface IRaidBoss {
  id: string
  name: string
  emoji: string
  element: EnumMonsterLine
  // The set whose pieces this boss drops (see SET_DEFINITIONS).
  setId: string
  skillName: string
}

export const RAID_BOSSES: IRaidBoss[] = [
  {
    id: 'lava_king',
    name: 'ราชันย์ลาวา',
    emoji: '🔥',
    element: EnumMonsterLine.FLAME,
    setId: 'blazing',
    skillName: 'ลาวาถล่ม',
  },
  {
    id: 'deep_dweller',
    name: 'อสูรห้วงลึก',
    emoji: '💧',
    element: EnumMonsterLine.TIDE,
    setId: 'tidal_guard',
    skillName: 'คลื่นกลืนกิน',
  },
  {
    id: 'ancient_flora',
    name: 'พฤกษาโบราณ',
    emoji: '🌿',
    element: EnumMonsterLine.LEAF,
    setId: 'deep_root',
    skillName: 'รากพันธนาการ',
  },
]

export const findRaidBoss = (bossId: string) => RAID_BOSSES.find(boss => boss.id === bossId)

export const getRaidBossFighter = (boss: IRaidBoss, difficulty: IRaidDifficulty): IFighter => ({
  name: boss.name,
  emoji: boss.emoji,
  element: boss.element,
  stats: scaleStats(STAGE_BASE_STATS[difficulty.minStage], difficulty.strength),
  skill: { name: boss.skillName, power: RAID_BOSS_SKILL_POWER },
})

// Boss tokens to exchange for a chosen piece of the boss's set; the grade can only be bought
// once the difficulty that drops it has been cleared.
export const RAID_EXCHANGE_COST: Partial<Record<EnumEquipmentGrade, number>> = {
  [EnumEquipmentGrade.RARE]: 20,
  [EnumEquipmentGrade.EPIC]: 50,
  [EnumEquipmentGrade.LEGENDARY]: 120,
}

export const requiredDifficultyForGrade = (grade: EnumEquipmentGrade) =>
  RAID_DIFFICULTIES.find(entry => entry.grade === grade)?.difficulty

export const bossTokenItemId = (bossId: string) => `boss_token:${bossId}`
