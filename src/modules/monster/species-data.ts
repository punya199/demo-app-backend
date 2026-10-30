import { EnumMonsterLine, EnumMonsterStage } from '../../db/entities/monster.entity'

export interface IEvolutionRule {
  to: string
  // Conditions are checked against the counters of the stage being left (they reset on evolving).
  maxCareMistakes?: number
  minTrainCount?: number
}

export interface ISpecies {
  id: string
  line: EnumMonsterLine
  stage: EnumMonsterStage
  name: string
  emoji: string
  minWeight: number
  // Checked in order; the first rule whose conditions all pass wins. A rule with no conditions is
  // the fallback. No matching rule = the monster stays in this stage.
  evolutions: IEvolutionRule[]
}

const lineSpecies = (
  line: EnumMonsterLine,
  names: Record<
    | 'egg'
    | 'baby1'
    | 'baby2'
    | 'adultGood'
    | 'adultPoor'
    | 'perfectGood'
    | 'perfectPoor'
    | 'ultimate',
    [string, string]
  >
): ISpecies[] => {
  const id = (key: string) => `${line}_${key}`
  const species = (
    key: keyof typeof names,
    stage: EnumMonsterStage,
    minWeight: number,
    evolutions: IEvolutionRule[]
  ): ISpecies => ({
    id: id(key),
    line,
    stage,
    name: names[key][0],
    emoji: names[key][1],
    minWeight,
    evolutions,
  })

  const toPerfect = (maxCareMistakes: number, minTrainCount: number): IEvolutionRule[] => [
    { to: id('perfectGood'), maxCareMistakes, minTrainCount },
    { to: id('perfectPoor') },
  ]

  return [
    species('egg', EnumMonsterStage.EGG, 1, [{ to: id('baby1') }]),
    species('baby1', EnumMonsterStage.BABY_1, 5, [{ to: id('baby2') }]),
    species('baby2', EnumMonsterStage.BABY_2, 10, [
      { to: id('adultGood'), maxCareMistakes: 3 },
      { to: id('adultPoor') },
    ]),
    species('adultGood', EnumMonsterStage.ADULT, 20, toPerfect(2, 8)),
    species('adultPoor', EnumMonsterStage.ADULT, 20, toPerfect(1, 12)),
    species('perfectGood', EnumMonsterStage.PERFECT, 30, [
      { to: id('ultimate'), maxCareMistakes: 1, minTrainCount: 12 },
    ]),
    species('perfectPoor', EnumMonsterStage.PERFECT, 30, []),
    species('ultimate', EnumMonsterStage.ULTIMATE, 40, []),
  ]
}

export const SPECIES: ISpecies[] = [
  ...lineSpecies(EnumMonsterLine.FLAME, {
    egg: ['ไข่เพลิง', '🥚'],
    baby1: ['ประกายจิ๋ว', '✨'],
    baby2: ['ถ่านน้อย', '🔥'],
    adultGood: ['เพลิงจอมซน', '🦎'],
    adultPoor: ['ควันกรุ่น', '💨'],
    perfectGood: ['อัคนีพยัคฆ์', '🐯'],
    perfectPoor: ['ลาวาอ้วน', '🌋'],
    ultimate: ['ราชาสุริยะ', '☀️'],
  }),
  ...lineSpecies(EnumMonsterLine.TIDE, {
    egg: ['ไข่วารี', '🥚'],
    baby1: ['หยดน้ำ', '💧'],
    baby2: ['ฟองจิ๋ว', '🫧'],
    adultGood: ['ปลาดาบน้อย', '🐟'],
    adultPoor: ['แมงกะพรุนขี้เซา', '🪼'],
    perfectGood: ['วาฬเกราะ', '🐋'],
    perfectPoor: ['หมึกขี้เกียจ', '🐙'],
    ultimate: ['เจ้าสมุทร', '🔱'],
  }),
  ...lineSpecies(EnumMonsterLine.LEAF, {
    egg: ['ไข่พฤกษ์', '🥚'],
    baby1: ['เมล็ดจิ๋ว', '🌰'],
    baby2: ['ต้นอ่อน', '🌱'],
    adultGood: ['กวางใบไม้', '🦌'],
    adultPoor: ['เห็ดง่วง', '🍄'],
    perfectGood: ['พยัคฆ์ไพร', '🐅'],
    perfectPoor: ['ตอไม้แก่', '🪵'],
    ultimate: ['เทพพนาลัย', '🌳'],
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
