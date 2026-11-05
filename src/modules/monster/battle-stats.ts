import { EnumMonsterLine, EnumMonsterStage } from '../../db/entities/monster.entity'
import { IEquipmentBonus, NO_EQUIPMENT_BONUS } from './equipment-data'
import { IMonsterState } from './monster-engine'
import { MAX_HEARTS } from './monster-rules'
import { capEffects, LEGACY_POTENTIAL, potentialEffects, statMultiplier } from './monster-potential'
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
  // Trainer passives: added to the base crit chance, and to the crit damage multiplier.
  critChance?: number
  critDamage?: number
  // Chance to dodge an incoming hit completely (drawn only when above 0).
  evasion?: number
  // Trainer passive keystones (1v1 fights only; the team engine ignores the three below).
  // Heals this share of the HP damage it deals.
  lifesteal?: number
  // Reflects this share of each hit it takes back at the attacker (ignores the attacker's shield).
  thorns?: number
  // 1 = always acts first in a round (both sides having it falls back to speed).
  firstStrike?: number
  // 1 = its hits can never be critical (the crit roll is still drawn, so RNG order is unchanged).
  noCrit?: number
  // Boss-set effects made for the real-time arena (the turn engine ignores them).
  // Hits on a burning target deal this much more (0.2 = +20%).
  burnBonus?: number
  // Every ARENA_SHIELD_REFRESH_SEC seconds, a shield of this share of max HP.
  shieldRefresh?: number
  // Skill cooldowns this much shorter (0.15 = -15%).
  cooldownCut?: number
  // Once, below 35% HP: a shield of this share of max HP, a cleanse and 2 s of CC immunity.
  lastStandShield?: number
  // Seconds off the dodge cooldown, and the next hit after a dodge crits and deals this much more.
  dodgeCdCutSec?: number
  afterDodgeBonus?: number
}

export interface IFighter {
  name: string
  // The owner's name for the pet, left out when it has none (see monster-name.ts).
  nickname?: string
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

  // The roll scales the form's own stat first; care and gear apply on top. A middle roll is x1.
  const potential = state.potential ?? LEGACY_POTENTIAL
  const rolled = (key: keyof IBattleStats) => species.stats[key] * statMultiplier(potential[key])

  let atk = rolled('atk') * (1 + ATK_BONUS_PER_STRENGTH_HEART * hearts(state.strength))
  if (hearts(state.fullness) === 0) {
    atk *= HUNGRY_ATK_MULTIPLIER
  }
  let spd = rolled('spd')
  if (state.weight > species.minWeight * OVERWEIGHT_RATIO) {
    spd *= OVERWEIGHT_SPD_MULTIPLIER
  }

  const effects = capEffects(
    Object.entries(potentialEffects(potential)).reduce(
      (sum, [key, value]) => ({
        ...sum,
        [key]: (sum[key as keyof IFighterEffects] ?? 0) + value,
      }),
      { ...equipment.effects }
    )
  )
  const hasEffects = Object.keys(effects).length > 0
  return {
    name: species.name,
    ...(state.nickname && { nickname: state.nickname }),
    emoji: species.emoji,
    // A fused monster fights with the element of the parent chosen as its base (`state.line`).
    element: species.stage === EnumMonsterStage.FUSED ? state.line : species.line,
    stats: {
      hp: Math.round(withEquipment(rolled('hp'), 'hp', equipment)),
      atk: Math.round(withEquipment(atk, 'atk', equipment)),
      def: Math.round(withEquipment(rolled('def'), 'def', equipment)),
      spd: Math.round(withEquipment(spd, 'spd', equipment)),
    },
    skill: species.skillByLine?.[state.line] ?? species.skill,
    // Left out entirely without set effects, so stored fighters look exactly as before.
    ...(hasEffects && { effects }),
  }
}
