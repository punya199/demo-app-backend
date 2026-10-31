import { EnumMonsterLine, EnumMonsterStage } from '../../db/entities/monster.entity'
import { IEquipmentBonus, NO_EQUIPMENT_BONUS } from './equipment-data'
import { IMonsterState } from './monster-engine'
import { MAX_HEARTS, NO_STAMINA_STAT_MULTIPLIER } from './monster-rules'
import { getSpecies, IBattleStats, ISkill } from './species-data'

// How a monster's care state turns its species' base stats into the stats it fights with.

export const ATK_BONUS_PER_STRENGTH_HEART = 0.05
export const HUNGRY_ATK_MULTIPLIER = 0.8
export const OVERWEIGHT_RATIO = 1.5
export const OVERWEIGHT_SPD_MULTIPLIER = 0.8

// Set effects (phase 5). A fighter without `effects` fights exactly as before: the engine only
// touches the RNG for effects that are present, so stored fights keep replaying identically.
export interface IFighterEffects {
  // Skill hits burn the target for this many of its own turns.
  burnTurns?: number
  // Starts the fight with a shield of this share of max HP.
  shieldPct?: number
  // Heals this share of max HP at the start of each of its own turns.
  regenPct?: number
  // Chance to strike again right after attacking (never chains).
  doubleStrikeChance?: number
}

export interface IFighter {
  name: string
  emoji: string
  element: EnumMonsterLine
  stats: IBattleStats
  skill: ISkill
  effects?: IFighterEffects
}

const hearts = (value: number) => Math.min(MAX_HEARTS, Math.ceil(Math.round(value * 1000) / 1000))

const withEquipment = (value: number, key: keyof IBattleStats, equipment: IEquipmentBonus) =>
  (value + equipment.flat[key]) * (1 + equipment.pct[key])

// Equipment adds flat stats first, then set bonuses scale the total.
export const toFighter = (
  state: IMonsterState,
  equipment: IEquipmentBonus = NO_EQUIPMENT_BONUS
): IFighter => {
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

  // Out of stamina: every stat is halved.
  const exhausted = state.stamina <= 0 ? NO_STAMINA_STAT_MULTIPLIER : 1

  const hasEffects = Object.keys(equipment.effects).length > 0
  return {
    name: species.name,
    emoji: species.emoji,
    element: species.line,
    stats: {
      hp: Math.round(withEquipment(species.stats.hp, 'hp', equipment) * exhausted),
      atk: Math.round(withEquipment(atk, 'atk', equipment) * exhausted),
      def: Math.round(withEquipment(species.stats.def, 'def', equipment) * exhausted),
      spd: Math.round(withEquipment(spd, 'spd', equipment) * exhausted),
    },
    skill: species.skill,
    // Left out entirely without set effects, so stored fighters look exactly as before.
    ...(hasEffects && { effects: equipment.effects }),
  }
}
