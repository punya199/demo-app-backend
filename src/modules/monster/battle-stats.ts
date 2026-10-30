import { EnumMonsterLine, EnumMonsterStage } from '../../db/entities/monster.entity'
import { IMonsterState } from './monster-engine'
import { MAX_HEARTS } from './monster-rules'
import { getSpecies, IBattleStats, ISkill } from './species-data'

// How a monster's care state turns its species' base stats into the stats it fights with.

export const ATK_BONUS_PER_STRENGTH_HEART = 0.05
export const HUNGRY_ATK_MULTIPLIER = 0.8
export const OVERWEIGHT_RATIO = 1.5
export const OVERWEIGHT_SPD_MULTIPLIER = 0.8

export interface IFighter {
  name: string
  emoji: string
  element: EnumMonsterLine
  stats: IBattleStats
  skill: ISkill
}

const hearts = (value: number) => Math.min(MAX_HEARTS, Math.ceil(Math.round(value * 1000) / 1000))

export const toFighter = (state: IMonsterState): IFighter => {
  const species = getSpecies(state.speciesId)
  if (species.stage === EnumMonsterStage.EGG) {
    throw new Error('An egg cannot fight')
  }

  let atk = species.stats.atk * (1 + ATK_BONUS_PER_STRENGTH_HEART * hearts(state.strength))
  if (hearts(state.fullness) === 0) {
    atk *= HUNGRY_ATK_MULTIPLIER
  }
  let spd = species.stats.spd
  if (state.weight > species.minWeight * OVERWEIGHT_RATIO) {
    spd *= OVERWEIGHT_SPD_MULTIPLIER
  }

  return {
    name: species.name,
    emoji: species.emoji,
    element: species.line,
    stats: {
      hp: species.stats.hp,
      atk: Math.round(atk),
      def: species.stats.def,
      spd: Math.round(spd),
    },
    skill: species.skill,
  }
}
