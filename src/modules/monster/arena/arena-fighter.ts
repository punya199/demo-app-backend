import { EnumMonsterLine, EnumMonsterStage } from '../../../db/entities/monster.entity'
import { toFighter } from '../battle-stats'
import { IEquipmentBonus, NO_EQUIPMENT_BONUS } from '../equipment-data'
import { IMonsterState } from '../monster-engine'
import { getSpecies, STAGE_BASE_STATS } from '../species-data'
import { ARENA_SKILLS, ARENA_STAGES, ARENA_TUNING } from './arena-data'
import { ARENA_SKILL_BY_ID, canEquipArenaSkill } from './arena-engine'
import { BOSS_RES, LINE_ACC, LINE_EVA, LINE_RES } from './arena-rules'
import { ArenaLine, IArenaFighterSpec, IArenaStage } from './arena-types'

// Bridges the game's monsters to the arena: which skills a form has, which a player may equip,
// and a fighter spec built from the monster's real stats (care, gear and trainer tree included).

export interface IArenaLoadout {
  s1: string | null
  s2: string | null
  dodge: string | null
}

export const EMPTY_LOADOUT: IArenaLoadout = { s1: null, s2: null, dodge: null }

const SKILLED_STAGES = [
  EnumMonsterStage.ADULT,
  EnumMonsterStage.PERFECT,
  EnumMonsterStage.ULTIMATE,
  EnumMonsterStage.FUSED,
]

// Eggs and babies fight with basic attacks only: no innate, no slots, no dodge.
export const hasArenaSkills = (stage: EnumMonsterStage) => SKILLED_STAGES.includes(stage)

// A fused form's elements are both parents' lines (from its id: fused_<a>_<b>); others: its line.
export const arenaElementsOf = (state: Pick<IMonsterState, 'speciesId' | 'line'>): ArenaLine[] => {
  if (state.speciesId.startsWith('fused_')) {
    return [...new Set(state.speciesId.slice('fused_'.length).split('_'))] as ArenaLine[]
  }
  return [state.line as ArenaLine]
}

const INNATE_BY_SPECIES = new Map(
  ARENA_SKILLS.filter(skill => skill.slot !== 'dodge' && !skill.src.includes('baby')).map(skill => [
    skill.src,
    skill.id,
  ])
)

// The form's own skill. A fused form uses its base line's Ultimate skill.
export const arenaInnateOf = (state: Pick<IMonsterState, 'speciesId' | 'line' | 'stage'>) => {
  if (!hasArenaSkills(state.stage)) {
    return null
  }
  if (state.stage === EnumMonsterStage.FUSED) {
    return INNATE_BY_SPECIES.get(`${state.line}_ultimate`) ?? null
  }
  return INNATE_BY_SPECIES.get(state.speciesId) ?? null
}

// Skills a player has unlocked: each species in their Dex unlocks the skill it carries (forms from
// Adult up: their innate; Baby 2: a neutral skill; Baby 1: a dodge skill).
export const unlockedArenaSkillIds = (dexSpeciesIds: Iterable<string>) => {
  const dex = new Set(dexSpeciesIds)
  return ARENA_SKILLS.filter(skill => dex.has(skill.src)).map(skill => skill.id)
}

// Drops whatever is no longer legal (not unlocked, wrong element, the new innate after evolving,
// a second passive), so a stored loadout can always be used as is.
export const cleanArenaLoadout = (
  state: Pick<IMonsterState, 'speciesId' | 'line' | 'stage'>,
  loadout: Partial<IArenaLoadout> | null | undefined,
  unlocked: Set<string>
): IArenaLoadout => {
  if (!hasArenaSkills(state.stage) || !loadout) {
    return { ...EMPTY_LOADOUT }
  }
  const owner = { elements: arenaElementsOf(state), innate: arenaInnateOf(state) }
  const ok = (id: string | null | undefined, slot: 'skill' | 'dodge', others: string[]) => {
    if (!id || !unlocked.has(id)) return null
    const skill = ARENA_SKILL_BY_ID[id]
    if (!skill || (slot === 'dodge') !== (skill.slot === 'dodge')) return null
    return canEquipArenaSkill(owner, skill, others) ? id : null
  }
  const s1 = ok(loadout.s1, 'skill', [])
  const s2 = loadout.s2 !== s1 ? ok(loadout.s2, 'skill', s1 ? [s1] : []) : null
  return { s1, s2, dodge: ok(loadout.dodge, 'dodge', []) }
}

const stageKeyOf = (stage: EnumMonsterStage) =>
  stage === EnumMonsterStage.FUSED ? EnumMonsterStage.ULTIMATE : stage

// The monster as an arena fighter: stats from toFighter (care, gear, trainer tree), the line's
// EVA/ACC/RES and arena HP lean, and gear/trainer effects the arena understands.
export const toArenaFighter = (
  state: IMonsterState,
  equipment: IEquipmentBonus = NO_EQUIPMENT_BONUS,
  loadout: IArenaLoadout = EMPTY_LOADOUT
): IArenaFighterSpec => {
  const fighter = toFighter(state, equipment)
  const line = fighter.element as ArenaLine
  const lean =
    ARENA_TUNING[`line:${line}:${stageKeyOf(state.stage)}`]?.hp ??
    ARENA_TUNING[`line:${line}`]?.hp ??
    100
  const effects = fighter.effects ?? {}
  const innate = arenaInnateOf(state)
  return {
    name: fighter.nickname ?? fighter.name,
    emoji: fighter.emoji,
    element: line,
    hp: (fighter.stats.hp * lean) / 100,
    atk: fighter.stats.atk,
    def: fighter.stats.def,
    spd: fighter.stats.spd,
    eva: LINE_EVA[line] + Math.round((effects.evasion ?? 0) * 100),
    acc: LINE_ACC[line],
    res: LINE_RES[line],
    crit: Math.round((effects.critChance ?? 0) * 100),
    skills: [innate, loadout.s1, loadout.s2].filter((id): id is string => !!id),
    dodge: hasArenaSkills(state.stage) ? loadout.dodge : null,
    ...(effects.lifesteal && {
      passive: { basicLifesteal: Math.round(effects.lifesteal * 100) },
    }),
  }
}

const LEVEL_STAGE: Record<IArenaStage['level'], EnumMonsterStage> = {
  baby1: EnumMonsterStage.BABY_1,
  baby2: EnumMonsterStage.BABY_2,
  adult: EnumMonsterStage.ADULT,
  perfect: EnumMonsterStage.PERFECT,
  ultimate: EnumMonsterStage.ULTIMATE,
}

export const findArenaStage = (stageId: string): IArenaStage | undefined => ARENA_STAGES[stageId]

// An adventure stage's enemy: the stage level's base stats x strength, HP/ATK x the tuned k%,
// DEF x sqrt(k%). Bosses get extra RES and ignore elements (see the engine).
export const arenaEnemyOf = (stage: IArenaStage): IArenaFighterSpec => {
  const base = STAGE_BASE_STATS[LEVEL_STAGE[stage.level]]
  const str =
    typeof stage.str === 'number'
      ? { hp: stage.str, atk: stage.str, def: stage.str, spd: stage.str }
      : stage.str
  const k = ARENA_TUNING[`adv:${stage.id}`]?.k ?? 100
  return {
    name: stage.name,
    emoji: stage.emoji,
    element: stage.el,
    hp: Math.round((base.hp * str.hp * k) / 100),
    atk: Math.round((base.atk * str.atk * k) / 100),
    def: Math.round(base.def * str.def * Math.sqrt(k / 100)),
    spd: Math.round(base.spd * str.spd),
    eva: LINE_EVA[stage.el],
    acc: LINE_ACC[stage.el],
    res: LINE_RES[stage.el] + (stage.boss ? BOSS_RES : 0),
    skills: stage.skills,
    dodge: null,
    boss: stage.boss,
  }
}

// Who unlocks a skill, for the skill screen ("from: <species name> (<stage>)").
export const arenaSkillSource = (src: string) => {
  try {
    const species = getSpecies(src)
    return { speciesId: src, name: species.name, emoji: species.emoji, stage: species.stage }
  } catch {
    return null
  }
}

export const ARENA_LINES = Object.values(EnumMonsterLine) as ArenaLine[]
