import {
  ADVANTAGE_PCT,
  CORE_DAMAGE_PCT,
  DISADVANTAGE_PCT,
  ELEMENT_BEATS,
  type Element,
  type EnemyKind,
  type HeroId,
} from './config'
import type { CoreEntry } from './sim'

export const HERO_ELEMENT: Record<HeroId, Element> = {
  archer: 'physical',
  mage: 'fire',
  knight: 'physical',
  'cinder-witch': 'fire',
  'frost-herald': 'ice',
  'storm-caller': 'ice',
  'sun-oracle': 'fire',
  'moss-healer': 'nature',
  'tide-bard': 'ice',
  'iron-warden': 'physical',
  'dawn-priestess': 'nature',
  'twig-archer': 'nature',
  'ember-lancer': 'fire',
  'glacier-sniper': 'ice',
  'void-blade': 'physical',
}

/** The boss entry is a placeholder: a boss uses its stage's BossDef.element. */
export const ENEMY_ELEMENT: Record<EnemyKind, Element> = {
  grunt: 'physical',
  runner: 'nature',
  tank: 'ice',
  armored: 'physical',
  swarmer: 'fire',
  elite: 'fire',
  boss: 'physical',
}

/** Percent multiplier for a hit from `attacker` element on `defender` element. */
export function advantagePct(attacker: Element, defender: Element): number {
  if (ELEMENT_BEATS[attacker] === defender) return ADVANTAGE_PCT
  if (ELEMENT_BEATS[defender] === attacker) return DISADVANTAGE_PCT
  return 100
}

/** Percent multiplier from the equipped cores for heroes of `element`. */
export function coreBonusPct(cores: readonly CoreEntry[], element: Element): number {
  return cores.reduce(
    (sum, c) => sum + (c.element === element ? CORE_DAMAGE_PCT[c.rarity] : 0),
    100
  )
}
