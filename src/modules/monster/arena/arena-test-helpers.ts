import { EnumMonsterLine, EnumMonsterStage } from '../../../db/entities/monster.entity'
import { createEgg, IMonsterState } from '../core/monster-engine'
import { createRng } from '../battle/battle-engine'
import {
  buildSetPiece,
  calcEquipmentBonus,
  EnumEquipmentGrade,
  EnumEquipmentSlot,
} from '../equipment/equipment-data'
import { ARENA_SKILLS } from './arena-data'
import { simulateArena } from './arena-engine'
import { arenaInnateOf, toArenaFighter } from './arena-fighter'
import { IArenaFighterSpec } from './arena-types'

// The yardstick the raid, PvP and world boss tuning specs measure against.

const SUFFIX: Record<string, string> = {
  [EnumMonsterStage.ADULT]: 'adultGood',
  [EnumMonsterStage.PERFECT]: 'perfectGood',
  [EnumMonsterStage.ULTIMATE]: 'ultimate',
}

export const wellCaredState = (line: EnumMonsterLine, stage: EnumMonsterStage): IMonsterState => ({
  ...createEgg(line, new Date('2026-01-01T03:00:00Z')),
  speciesId: `${line}_${SUFFIX[stage]}`,
  stage,
  fullness: 4,
  strength: 4,
  weight: 40,
})

// A well-cared pet with no gear and its line's first two skills in its slots.
export const wellCaredArenaFighter = (
  line: EnumMonsterLine,
  stage: EnumMonsterStage,
  gear?: { setId: string; grade: EnumEquipmentGrade; enhanceLevel: number }
) => {
  const state = wellCaredState(line, stage)
  const innate = arenaInnateOf(state)
  const [s1, s2] = ARENA_SKILLS.filter(
    skill => skill.el === line && skill.slot === 'active' && skill.id !== innate
  )
  const items = gear
    ? Object.values(EnumEquipmentSlot).map((slot, index) => ({
        ...buildSetPiece(`${gear.setId}_${slot}`, gear.grade, createRng(index + 1)),
        enhanceLevel: gear.enhanceLevel,
      }))
    : []
  return toArenaFighter(state, items.length ? calcEquipmentBonus(items) : undefined, {
    s1: s1?.id ?? null,
    s2: s2?.id ?? null,
    dodge: 'dg_step',
  })
}

export const arenaWinRate = (me: IArenaFighterSpec, foe: IArenaFighterSpec, fights: number) => {
  let wins = 0
  for (let seed = 1; seed <= fights; seed++) {
    wins += simulateArena([[me], [foe]], seed).winner === 0 ? 1 : 0
  }
  return wins / fights
}

// What a typical player brings to the arena: a full Standard craft set at epic +5 (marksman, a
// plain offence set), and the flagship ceiling: a full legendary +10 set.
export const MID_TIER_GEAR = {
  setId: 'marksman',
  grade: EnumEquipmentGrade.EPIC,
  enhanceLevel: 5,
}
export const FLAGSHIP_GEAR = {
  setId: 'evergreen',
  grade: EnumEquipmentGrade.LEGENDARY,
  enhanceLevel: 10,
}
