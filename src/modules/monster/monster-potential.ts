import { CRITICAL_CHANCE, CRITICAL_MULTIPLIER } from './battle-engine'
import { IFighterEffects } from './battle-stats'
import { IBattleStats } from './species-data'

// Pet Potential (pure): every monster rolls seven numbers (0-1) when its egg hatches and keeps
// them for life. Rolls only move a stat inside a fixed range; the range follows the monster's form.

export interface IPotential {
  hp: number
  atk: number
  def: number
  spd: number
  critRate: number
  critDamage: number
  evasion: number
}

export type PotentialKey = keyof IPotential
export const POTENTIAL_KEYS: PotentialKey[] = [
  'hp',
  'atk',
  'def',
  'spd',
  'critRate',
  'critDamage',
  'evasion',
]

// HP/ATK/DEF/SPD roll x0.90 to x1.10 of the form's stat (the middle roll is exactly x1).
export const POTENTIAL_STAT_SPREAD = 0.1
// Extra stats: what a roll of 1 adds on top of the base (crit rate 15% + 10% = 25%, ...).
export const POTENTIAL_CRIT_RATE_MAX_BONUS = 0.1
export const POTENTIAL_CRIT_DAMAGE_MAX_BONUS = 0.3
export const POTENTIAL_EVASION_MAX = 0.05

// Lifesteal and thorns (passives) stack to at most this share.
export const LIFESTEAL_CAP = 0.5
export const THORNS_CAP = 0.5

// Stacking caps (potential + gear + passives): crit rate 60%, crit damage x3.0, evasion 30%.
export const CRIT_RATE_CAP = 0.6
export const CRIT_DAMAGE_CAP = 3
export const EVASION_CAP = 0.3
// Craft-set effects (arena only), see IFighterEffects.
export const DAMAGE_CUT_CAP = 0.25
export const EXECUTE_BONUS_CAP = 0.5
export const ON_BASIC_CHANCE_CAP = 50
export const STUN_ON_BASIC_CAP = 15
export const POISON_BONUS_CAP = 0.3
export const RETORT_CAP = 1

// Grade from the average roll, best first.
export const POTENTIAL_GRADES: [string, number][] = [
  ['S', 0.72],
  ['A', 0.62],
  ['B', 0.5],
  ['C', 0.4],
  ['D', 0],
]

// Monsters from before potential existed (column is null): base stats stay as they were (middle
// roll) and the extra stats stay at their old fixed values (lowest roll), so nothing changes.
export const LEGACY_POTENTIAL: IPotential = {
  hp: 0.5,
  atk: 0.5,
  def: 0.5,
  spd: 0.5,
  critRate: 0,
  critDamage: 0,
  evasion: 0,
}

export const rollPotential = (rand: () => number): IPotential => ({
  hp: rand(),
  atk: rand(),
  def: rand(),
  spd: rand(),
  critRate: rand(),
  critDamage: rand(),
  evasion: rand(),
})

export const statMultiplier = (roll: number) => 1 + (roll - 0.5) * 2 * POTENTIAL_STAT_SPREAD

// The better roll of each stat, so merging good pets pays.
export const mergePotential = (a: IPotential | null, b: IPotential | null): IPotential => {
  const first = a ?? LEGACY_POTENTIAL
  const second = b ?? LEGACY_POTENTIAL
  return Object.fromEntries(
    POTENTIAL_KEYS.map(key => [key, Math.max(first[key], second[key])])
  ) as unknown as IPotential
}

// Rounded to 4 places so a grade boundary is not missed by floating point error.
export const averageRoll = (potential: IPotential) =>
  Math.round(
    (POTENTIAL_KEYS.reduce((sum, key) => sum + potential[key], 0) / POTENTIAL_KEYS.length) * 10000
  ) / 10000

export const potentialGrade = (potential: IPotential) => {
  const average = averageRoll(potential)
  return POTENTIAL_GRADES.find(([, min]) => average >= min)![0]
}

// Battle effects the extra rolls add. Left out when zero, so a fighter that rolled nothing extra
// (every legacy monster) has no effects at all and old fights replay exactly.
export const potentialEffects = (potential: IPotential): IFighterEffects => ({
  ...(potential.critRate > 0 && { critChance: potential.critRate * POTENTIAL_CRIT_RATE_MAX_BONUS }),
  ...(potential.critDamage > 0 && {
    critDamage: potential.critDamage * POTENTIAL_CRIT_DAMAGE_MAX_BONUS,
  }),
  ...(potential.evasion > 0 && { evasion: potential.evasion * POTENTIAL_EVASION_MAX }),
})

const CRAFT_EFFECT_CAPS: [keyof IFighterEffects, number][] = [
  ['damageCut', DAMAGE_CUT_CAP],
  ['executeBonus', EXECUTE_BONUS_CAP],
  ['slowOnBasic', ON_BASIC_CHANCE_CAP],
  ['defDownOnBasic', ON_BASIC_CHANCE_CAP],
  ['poisonOnBasic', ON_BASIC_CHANCE_CAP],
  ['curseOnBasic', ON_BASIC_CHANCE_CAP],
  ['stunOnBasic', STUN_ON_BASIC_CAP],
  ['poisonBonus', POISON_BONUS_CAP],
  ['retort', RETORT_CAP],
]

// Applies the stacking caps to effects that are already summed (potential + gear + passives).
export const capEffects = (effects: IFighterEffects): IFighterEffects => {
  const capped = { ...effects }
  if (capped.critChance !== undefined) {
    capped.critChance = Math.min(capped.critChance, CRIT_RATE_CAP - CRITICAL_CHANCE)
  }
  if (capped.critDamage !== undefined) {
    capped.critDamage = Math.min(capped.critDamage, CRIT_DAMAGE_CAP - CRITICAL_MULTIPLIER)
  }
  if (capped.evasion !== undefined) {
    capped.evasion = Math.min(capped.evasion, EVASION_CAP)
  }
  if (capped.lifesteal !== undefined) {
    capped.lifesteal = Math.min(capped.lifesteal, LIFESTEAL_CAP)
  }
  if (capped.thorns !== undefined) {
    capped.thorns = Math.min(capped.thorns, THORNS_CAP)
  }
  for (const [key, cap] of CRAFT_EFFECT_CAPS) {
    if (capped[key] !== undefined) {
      capped[key] = Math.min(capped[key], cap)
    }
  }
  return capped
}

// What a fighter really has, in display units (percent, and crit damage as a percent multiplier).
export const combatTotals = (effects: IFighterEffects = {}) => ({
  critRate: Math.round((CRITICAL_CHANCE + (effects.critChance ?? 0)) * 1000) / 10,
  critDamage: Math.round((CRITICAL_MULTIPLIER + (effects.critDamage ?? 0)) * 1000) / 10,
  evasion: Math.round((effects.evasion ?? 0) * 1000) / 10,
})

export interface IPotentialStatView {
  min: number
  max: number
  value: number
}

// min / max / value per stat for a form's base stats, for the care page. Base stats are the form's
// own numbers before care, gear and passives; extra stats are in display units (see combatTotals).
export const buildPotentialView = (base: IBattleStats, potential: IPotential | null) => {
  const rolls = potential ?? LEGACY_POTENTIAL
  const stat = (key: keyof IBattleStats): IPotentialStatView => ({
    min: Math.round(base[key] * (1 - POTENTIAL_STAT_SPREAD)),
    max: Math.round(base[key] * (1 + POTENTIAL_STAT_SPREAD)),
    value: Math.round(base[key] * statMultiplier(rolls[key])),
  })
  const extra = (min: number, span: number, roll: number): IPotentialStatView => ({
    min,
    max: Math.round((min + span) * 10) / 10,
    value: Math.round((min + span * roll) * 10) / 10,
  })
  return {
    isLegacy: potential === null,
    grade: potential ? potentialGrade(potential) : null,
    average: potential ? Math.round(averageRoll(potential) * 1000) / 10 : null,
    stats: {
      hp: stat('hp'),
      atk: stat('atk'),
      def: stat('def'),
      spd: stat('spd'),
      critRate: extra(CRITICAL_CHANCE * 100, POTENTIAL_CRIT_RATE_MAX_BONUS * 100, rolls.critRate),
      critDamage: extra(
        CRITICAL_MULTIPLIER * 100,
        POTENTIAL_CRIT_DAMAGE_MAX_BONUS * 100,
        rolls.critDamage
      ),
      evasion: extra(0, POTENTIAL_EVASION_MAX * 100, rolls.evasion),
    },
  }
}
