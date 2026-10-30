import { EnumMonsterLine, EnumMonsterStage } from '../../db/entities/monster.entity'
import { IFighter } from './battle-stats'
import { scaleStats, STAGE_BASE_STATS } from './species-data'

export interface IAdventureStage {
  id: string
  enemy: IFighter
  isBoss: boolean
  // Coins for a win; the first win on a stage pays FIRST_CLEAR_MULTIPLIER times this.
  reward: number
  // Gems paid once, on the first win (bosses only).
  firstClearGems: number
}

export interface IAdventureArea {
  id: string
  name: string
  emoji: string
  // Stage label shown as a hint only - any hatched monster may try any unlocked stage.
  recommendedStage: EnumMonsterStage
  stages: IAdventureStage[]
}

export const FIRST_CLEAR_MULTIPLIER = 2

const enemy = (
  id: string,
  name: string,
  emoji: string,
  element: EnumMonsterLine,
  level: EnumMonsterStage,
  strength: number,
  skillName: string,
  reward: number,
  isBoss = false,
  firstClearGems = 0
): IAdventureStage => ({
  id,
  isBoss,
  reward,
  firstClearGems,
  enemy: {
    name,
    emoji,
    element,
    stats: scaleStats(STAGE_BASE_STATS[level], strength),
    skill: { name: skillName, power: isBoss ? 1.8 : 1.5 },
  },
})

// Areas unlock in order, and stages inside an area unlock in order: clearing a stage opens the
// next one, and clearing an area's boss (its last stage) opens the next area.
export const ADVENTURE_AREAS: IAdventureArea[] = [
  {
    id: 'meadow',
    name: 'ทุ่งหญ้าเริ่มต้น',
    emoji: '🌾',
    recommendedStage: EnumMonsterStage.BABY_2,
    stages: [
      enemy(
        'meadow_1',
        'หนอนใบไม้',
        '🐛',
        EnumMonsterLine.LEAF,
        EnumMonsterStage.BABY_1,
        1,
        'ใยเหนียว',
        10
      ),
      enemy(
        'meadow_2',
        'ปูน้ำจืด',
        '🦀',
        EnumMonsterLine.TIDE,
        EnumMonsterStage.BABY_2,
        0.8,
        'ก้ามหนีบ',
        12
      ),
      enemy(
        'meadow_3',
        'ค้างคาวถ่าน',
        '🦇',
        EnumMonsterLine.FLAME,
        EnumMonsterStage.BABY_2,
        0.85,
        'ปีกไฟ',
        14
      ),
      enemy(
        'meadow_boss',
        'กระต่ายยักษ์',
        '🐇',
        EnumMonsterLine.LEAF,
        EnumMonsterStage.ADULT,
        0.75,
        'กระทืบพสุธา',
        40,
        true,
        5
      ),
    ],
  },
  {
    id: 'coast',
    name: 'ชายฝั่งหมอก',
    emoji: '🌊',
    recommendedStage: EnumMonsterStage.ADULT,
    stages: [
      enemy(
        'coast_1',
        'นกนางนวลซ่า',
        '🐦',
        EnumMonsterLine.TIDE,
        EnumMonsterStage.ADULT,
        0.85,
        'โฉบคลื่น',
        25
      ),
      enemy(
        'coast_2',
        'แมงป่องเพลิง',
        '🦂',
        EnumMonsterLine.FLAME,
        EnumMonsterStage.ADULT,
        0.95,
        'เหล็กในร้อน',
        28
      ),
      enemy(
        'coast_3',
        'เต่าหินผา',
        '🐢',
        EnumMonsterLine.TIDE,
        EnumMonsterStage.ADULT,
        1.05,
        'กระดองกระแทก',
        30
      ),
      enemy(
        'coast_boss',
        'ฉลามหมอก',
        '🦈',
        EnumMonsterLine.TIDE,
        EnumMonsterStage.PERFECT,
        0.95,
        'ขย้ำในหมอก',
        90,
        true,
        10
      ),
    ],
  },
  {
    id: 'volcano',
    name: 'ภูเขาไฟหลับ',
    emoji: '🌋',
    recommendedStage: EnumMonsterStage.PERFECT,
    stages: [
      enemy(
        'volcano_1',
        'งูลาวา',
        '🐍',
        EnumMonsterLine.FLAME,
        EnumMonsterStage.PERFECT,
        0.9,
        'รัดหลอมละลาย',
        50
      ),
      enemy(
        'volcano_2',
        'หมูป่าเกราะหิน',
        '🐗',
        EnumMonsterLine.LEAF,
        EnumMonsterStage.PERFECT,
        1,
        'พุ่งชนหินผา',
        55
      ),
      enemy(
        'volcano_3',
        'อินทรีพายุ',
        '🦅',
        EnumMonsterLine.LEAF,
        EnumMonsterStage.PERFECT,
        1.1,
        'กรงเล็บพายุ',
        60
      ),
      enemy(
        'volcano_boss',
        'มังกรหลับใหล',
        '🐉',
        EnumMonsterLine.FLAME,
        EnumMonsterStage.ULTIMATE,
        1,
        'ลมหายใจภูเขาไฟ',
        180,
        true,
        20
      ),
    ],
  },
]

const STAGE_ORDER = ADVENTURE_AREAS.flatMap(area => area.stages.map(stage => ({ area, stage })))

export const findAdventureStage = (stageId: string) =>
  STAGE_ORDER.find(entry => entry.stage.id === stageId)

// A stage is open when it is the very first one or the stage before it (across areas) is cleared.
export const isStageUnlocked = (stageId: string, clearedStageIds: Set<string>) => {
  const index = STAGE_ORDER.findIndex(entry => entry.stage.id === stageId)
  if (index < 0) {
    return false
  }
  return index === 0 || clearedStageIds.has(STAGE_ORDER[index - 1].stage.id)
}
