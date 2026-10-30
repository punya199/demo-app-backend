import { EnumMonsterLine, EnumMonsterStage } from '../../db/entities/monster.entity'

export interface IEvolutionRule {
  to: string
  // Care conditions are checked against the counters of the stage being left (they reset on
  // evolving). minWins counts the monster's lifetime wins.
  maxCareMistakes?: number
  minTrainCount?: number
  minWins?: number
}

export interface IBattleStats {
  hp: number
  atk: number
  def: number
  spd: number
}

export interface ISkill {
  name: string
  power: number
}

export interface ISpecies {
  id: string
  line: EnumMonsterLine
  stage: EnumMonsterStage
  name: string
  emoji: string
  minWeight: number
  // Base battle stats before care modifiers (see battle-stats.ts). An egg has none and can't fight.
  stats: IBattleStats
  skill: ISkill
  // Checked in order; the first rule whose conditions all pass wins. A rule with no conditions is
  // the fallback. No matching rule = the monster stays in this stage.
  evolutions: IEvolutionRule[]
}

export const STAGE_BASE_STATS: Record<EnumMonsterStage, IBattleStats> = {
  [EnumMonsterStage.EGG]: { hp: 0, atk: 0, def: 0, spd: 0 },
  [EnumMonsterStage.BABY_1]: { hp: 24, atk: 5, def: 3, spd: 5 },
  [EnumMonsterStage.BABY_2]: { hp: 40, atk: 8, def: 5, spd: 7 },
  [EnumMonsterStage.ADULT]: { hp: 70, atk: 14, def: 9, spd: 11 },
  [EnumMonsterStage.PERFECT]: { hp: 105, atk: 21, def: 14, spd: 15 },
  [EnumMonsterStage.ULTIMATE]: { hp: 150, atk: 30, def: 20, spd: 20 },
}

// Each line leans toward one stat: flame hits hard, tide is tanky, leaf is fast.
const LINE_BIAS: Record<EnumMonsterLine, IBattleStats> = {
  [EnumMonsterLine.FLAME]: { hp: 1, atk: 1.15, def: 1, spd: 1 },
  [EnumMonsterLine.TIDE]: { hp: 1.15, atk: 1, def: 1.1, spd: 1 },
  [EnumMonsterLine.LEAF]: { hp: 1.05, atk: 1, def: 1, spd: 1.15 },
}

type EnumFormQuality = 'normal' | 'good' | 'poor'

const QUALITY_MULTIPLIER: Record<EnumFormQuality, number> = {
  normal: 1,
  good: 1.1,
  poor: 0.95,
}

export const scaleStats = (base: IBattleStats, multiplier: IBattleStats | number): IBattleStats => {
  const factor = (key: keyof IBattleStats) =>
    typeof multiplier === 'number' ? multiplier : multiplier[key]
  return {
    hp: Math.round(base.hp * factor('hp')),
    atk: Math.round(base.atk * factor('atk')),
    def: Math.round(base.def * factor('def')),
    spd: Math.round(base.spd * factor('spd')),
  }
}

type FormKey =
  | 'egg'
  | 'baby1'
  | 'baby2'
  | 'adultGood'
  | 'adultPoor'
  | 'perfectGood'
  | 'perfectPoor'
  | 'ultimate'

// [name, emoji, skill name]
type FormNames = Record<FormKey, [string, string, string]>

const SKILL_POWER = 1.6
const ULTIMATE_SKILL_POWER = 1.8

const lineSpecies = (line: EnumMonsterLine, names: FormNames): ISpecies[] => {
  const id = (key: string) => `${line}_${key}`
  const species = (
    key: FormKey,
    stage: EnumMonsterStage,
    quality: EnumFormQuality,
    minWeight: number,
    evolutions: IEvolutionRule[]
  ): ISpecies => ({
    id: id(key),
    line,
    stage,
    name: names[key][0],
    emoji: names[key][1],
    minWeight,
    stats: scaleStats(
      scaleStats(STAGE_BASE_STATS[stage], LINE_BIAS[line]),
      QUALITY_MULTIPLIER[quality]
    ),
    skill: {
      name: names[key][2],
      power: stage === EnumMonsterStage.ULTIMATE ? ULTIMATE_SKILL_POWER : SKILL_POWER,
    },
    evolutions,
  })

  const toPerfect = (maxCareMistakes: number, minTrainCount: number): IEvolutionRule[] => [
    { to: id('perfectGood'), maxCareMistakes, minTrainCount },
    { to: id('perfectPoor') },
  ]

  return [
    species('egg', EnumMonsterStage.EGG, 'normal', 1, [{ to: id('baby1') }]),
    species('baby1', EnumMonsterStage.BABY_1, 'normal', 5, [{ to: id('baby2') }]),
    species('baby2', EnumMonsterStage.BABY_2, 'normal', 10, [
      { to: id('adultGood'), maxCareMistakes: 3 },
      { to: id('adultPoor') },
    ]),
    species('adultGood', EnumMonsterStage.ADULT, 'good', 20, toPerfect(2, 6)),
    species('adultPoor', EnumMonsterStage.ADULT, 'poor', 20, toPerfect(1, 10)),
    species('perfectGood', EnumMonsterStage.PERFECT, 'good', 30, [
      { to: id('ultimate'), maxCareMistakes: 1, minTrainCount: 10, minWins: 5 },
    ]),
    species('perfectPoor', EnumMonsterStage.PERFECT, 'poor', 30, []),
    species('ultimate', EnumMonsterStage.ULTIMATE, 'good', 40, []),
  ]
}

export const SPECIES: ISpecies[] = [
  ...lineSpecies(EnumMonsterLine.FLAME, {
    egg: ['ไข่เพลิง', '🥚', '-'],
    baby1: ['ประกายจิ๋ว', '✨', 'ประกายไฟ'],
    baby2: ['ถ่านน้อย', '🔥', 'ถ่านลุก'],
    adultGood: ['เพลิงจอมซน', '🦎', 'หางเพลิง'],
    adultPoor: ['ควันกรุ่น', '💨', 'ควันพิษ'],
    perfectGood: ['อัคนีพยัคฆ์', '🐯', 'กรงเล็บอัคคี'],
    perfectPoor: ['ลาวาอ้วน', '🌋', 'ลาวาทับ'],
    ultimate: ['ราชาสุริยะ', '☀️', 'สุริยะแผดเผา'],
  }),
  ...lineSpecies(EnumMonsterLine.TIDE, {
    egg: ['ไข่วารี', '🥚', '-'],
    baby1: ['หยดน้ำ', '💧', 'กระเซ็น'],
    baby2: ['ฟองจิ๋ว', '🫧', 'ฟองสบู่'],
    adultGood: ['ปลาดาบน้อย', '🐟', 'ดาบน้ำ'],
    adultPoor: ['แมงกะพรุนขี้เซา', '🪼', 'หนวดช็อต'],
    perfectGood: ['วาฬเกราะ', '🐋', 'คลื่นเกราะ'],
    perfectPoor: ['หมึกขี้เกียจ', '🐙', 'หมึกพ่น'],
    ultimate: ['เจ้าสมุทร', '🔱', 'ตรีศูลสมุทร'],
  }),
  ...lineSpecies(EnumMonsterLine.LEAF, {
    egg: ['ไข่พฤกษ์', '🥚', '-'],
    baby1: ['เมล็ดจิ๋ว', '🌰', 'เมล็ดดีด'],
    baby2: ['ต้นอ่อน', '🌱', 'ใบมีด'],
    adultGood: ['กวางใบไม้', '🦌', 'เขาพฤกษา'],
    adultPoor: ['เห็ดง่วง', '🍄', 'สปอร์หลับ'],
    perfectGood: ['พยัคฆ์ไพร', '🐅', 'กรงเล็บไพร'],
    perfectPoor: ['ตอไม้แก่', '🪵', 'รากฟาด'],
    ultimate: ['เทพพนาลัย', '🌳', 'พนาพิโรธ'],
  }),
]

const speciesById = new Map(SPECIES.map(species => [species.id, species]))

export const getSpecies = (speciesId: string): ISpecies => {
  const species = speciesById.get(speciesId)
  if (!species) {
    throw new Error(`Unknown monster species: ${speciesId}`)
  }
  return species
}

export const eggSpeciesId = (line: EnumMonsterLine) => `${line}_egg`
