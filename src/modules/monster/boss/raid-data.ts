import { EnumMonsterLine, EnumMonsterStage } from '../../../db/entities/monster.entity'
import { arenaBossSpec } from '../arena/arena-fighter'
import { IArenaFighterSpec } from '../arena/arena-types'
import { IFighter } from '../battle/battle-stats'
import { EnumEquipmentGrade, EnumMaterialId } from '../equipment/equipment-data'
import { scaleStats, STAGE_BASE_STATS } from '../core/species-data'

// Boss Raid: a solo real-time arena fight against an element boss. Winning always drops one piece
// of that boss's set.

export enum EnumRaidDifficulty {
  NORMAL = 'normal',
  HARD = 'hard',
  NIGHTMARE = 'nightmare',
}

// Lives in species-data (equipment needs it too); re-exported so existing imports keep working.
export { isStageAtLeast } from '../core/species-data'

export interface IRaidDifficulty {
  difficulty: EnumRaidDifficulty
  // The form needed to enter, and the form whose base stats the boss is scaled from.
  minStage: EnumMonsterStage
  // Stat multiplier on that form's base stats, tuned (raid-data.spec.ts) so a well-cared monster
  // of minStage wins about 70% / 50% / 30% of the time (averaged over the three lines), with no
  // set, both on the arena and on the turn engine. Raid fights ignore the element triangle, otherwise a boss would be unbeatable for the
  // line it counters and every line could only collect two of the three sets.
  strength: number
  // Grade of the set piece a win drops.
  grade: EnumEquipmentGrade
  // Raid tokens for a win (doubled for the first win of each boss and difficulty).
  raidTokens: number
  // The refine stone every win drops (none on Normal).
  refineStone: EnumMaterialId | null
}

export const RAID_DIFFICULTIES: IRaidDifficulty[] = [
  {
    difficulty: EnumRaidDifficulty.NORMAL,
    minStage: EnumMonsterStage.ADULT,
    strength: 1.125,
    grade: EnumEquipmentGrade.RARE,
    raidTokens: 2,
    refineStone: null,
  },
  {
    difficulty: EnumRaidDifficulty.HARD,
    minStage: EnumMonsterStage.PERFECT,
    strength: 1.21,
    grade: EnumEquipmentGrade.EPIC,
    raidTokens: 4,
    refineStone: EnumMaterialId.REFINE_EPIC,
  },
  {
    difficulty: EnumRaidDifficulty.NIGHTMARE,
    minStage: EnumMonsterStage.ULTIMATE,
    strength: 1.26,
    grade: EnumEquipmentGrade.LEGENDARY,
    raidTokens: 8,
    refineStone: EnumMaterialId.REFINE_LEGENDARY,
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
  // Pixel-art sprite id the client draws (the emoji is its fallback).
  sprite: string
  element: EnumMonsterLine
  // The set whose pieces this boss drops (see SET_DEFINITIONS).
  setId: string
  skillName: string
  // Its two skills in the arena.
  arenaSkills: [string, string]
}

export const RAID_BOSSES: IRaidBoss[] = [
  {
    id: 'lava_king',
    name: 'ราชันย์ลาวา',
    emoji: '🔥',
    sprite: 'lavaking',
    element: EnumMonsterLine.FLAME,
    setId: 'blazing',
    skillName: 'ลาวาถล่ม',
    arenaSkills: ['e_lavacoil', 'e_volcano'],
  },
  {
    id: 'deep_dweller',
    name: 'อสูรห้วงลึก',
    emoji: '💧',
    sprite: 'abyssfish',
    element: EnumMonsterLine.TIDE,
    setId: 'tidal_guard',
    skillName: 'คลื่นกลืนกิน',
    arenaSkills: ['e_whirlpool', 'e_mistbite'],
  },
  {
    id: 'ancient_flora',
    name: 'พฤกษาโบราณ',
    emoji: '🌿',
    sprite: 'flora',
    element: EnumMonsterLine.LEAF,
    setId: 'deep_root',
    skillName: 'รากพันธนาการ',
    arenaSkills: ['e_stomp', 'e_stormclaw'],
  },
  {
    id: 'radiant_seraph',
    name: 'เซราฟรัศมี',
    emoji: '✨',
    sprite: 'raidseraph',
    element: EnumMonsterLine.HOLY,
    setId: 'radiant',
    skillName: 'แสงพิพากษา',
    arenaSkills: ['e_fan', 'e_plumes'],
  },
  {
    id: 'void_sovereign',
    name: 'จ้าวมืดมิด',
    emoji: '🌑',
    sprite: 'vampire',
    element: EnumMonsterLine.DARK,
    setId: 'nightfall',
    skillName: 'ราตรีกลืนกิน',
    arenaSkills: ['e_dragontail', 'e_orebite'],
  },
  {
    id: 'nameless_phantom',
    name: 'ราชันย์เงานิรนาม',
    emoji: '🌫️',
    sprite: 'nameless',
    element: EnumMonsterLine.SHADOW,
    setId: 'shadow_veil',
    skillName: 'คมเงาเงียบ',
    arenaSkills: ['e_sparktail', 'e_mistbite'],
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

export const getRaidBossArena = (
  boss: IRaidBoss,
  difficulty: IRaidDifficulty
): IArenaFighterSpec => ({
  ...arenaBossSpec(getRaidBossFighter(boss, difficulty), boss.arenaSkills),
  sprite: boss.sprite,
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
