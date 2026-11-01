import { EnumMonsterLine, EnumMonsterStage } from '../../db/entities/monster.entity'
import { createRng, rollHit, simulateBattle } from './battle-engine'
import { toFighter } from './battle-stats'
import { createEgg } from './monster-engine'
import { createFused } from './monster-merge'
import {
  buildPotentialView,
  capEffects,
  combatTotals,
  IPotential,
  LEGACY_POTENTIAL,
  mergePotential,
  potentialEffects,
  potentialGrade,
  rollPotential,
  statMultiplier,
} from './monster-potential'
import { getSpecies } from './species-data'

const NOW = new Date('2026-01-01T03:00:00Z')
const flat = (value: number): IPotential => ({
  hp: value,
  atk: value,
  def: value,
  spd: value,
  critRate: value,
  critDamage: value,
  evasion: value,
})
const adult = (potential: IPotential | null) => ({
  ...createEgg(EnumMonsterLine.FLAME, NOW, potential),
  speciesId: 'flame_adultGood',
  stage: EnumMonsterStage.ADULT,
  fullness: 4,
  strength: 3,
  weight: 20,
})

describe('rolls', () => {
  it('rolls seven numbers between 0 and 1', () => {
    const rolled = rollPotential(() => 0.25)
    expect(Object.values(rolled)).toEqual([0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25])
  })

  it('moves a stat by up to 10% either way, with the middle roll exactly x1', () => {
    expect(statMultiplier(0)).toBeCloseTo(0.9)
    expect(statMultiplier(0.5)).toBe(1)
    expect(statMultiplier(1)).toBeCloseTo(1.1)
  })

  it.each([
    [0.8, 'S'],
    [0.72, 'S'],
    [0.7, 'A'],
    [0.62, 'A'],
    [0.55, 'B'],
    [0.5, 'B'],
    [0.45, 'C'],
    [0.4, 'C'],
    [0.2, 'D'],
  ])('grades an average roll of %s as %s', (average, grade) => {
    expect(potentialGrade(flat(average))).toBe(grade)
  })
})

describe('fighter stats', () => {
  it('gives a legacy monster (no potential) exactly the stats it always had', () => {
    const species = getSpecies('flame_adultGood')
    const legacy = toFighter(adult(null))
    const middle = toFighter(adult({ ...LEGACY_POTENTIAL }))
    expect(legacy).toEqual(middle)
    expect(legacy.effects).toBeUndefined()
    expect(legacy.stats.hp).toBe(species.stats.hp)
  })

  it('scales HP, ATK, DEF and SPD by the roll', () => {
    const low = toFighter(adult({ ...flat(0), critRate: 0, critDamage: 0, evasion: 0 })).stats
    const high = toFighter(adult({ ...flat(1), critRate: 0, critDamage: 0, evasion: 0 })).stats
    const hp = getSpecies('flame_adultGood').stats.hp
    expect(low.hp).toBe(Math.round(hp * 0.9))
    expect(high.hp).toBe(Math.round(hp * 1.1))
  })

  it('adds crit rate, crit damage and evasion from the extra rolls, up to the caps', () => {
    expect(potentialEffects(flat(1))).toEqual({ critChance: 0.1, critDamage: 0.3, evasion: 0.05 })
    expect(combatTotals(potentialEffects(flat(1)))).toEqual({
      critRate: 25,
      critDamage: 180,
      evasion: 5,
    })
    expect(combatTotals(capEffects({ critChance: 0.9, critDamage: 5, evasion: 0.9 }))).toEqual({
      critRate: 60,
      critDamage: 300,
      evasion: 30,
    })
  })

  it('stacks the roll with gear and passive effects', () => {
    const fighter = toFighter(adult(flat(1)), {
      flat: { hp: 0, atk: 0, def: 0, spd: 0 },
      pct: { hp: 0, atk: 0, def: 0, spd: 0 },
      effects: { critChance: 0.05 },
    })
    expect(fighter.effects?.critChance).toBeCloseTo(0.15)
  })
})

describe('merge', () => {
  it('keeps the better roll of each stat, treating a legacy parent as its old values', () => {
    const merged = mergePotential({ ...flat(0.2), hp: 0.9 }, { ...flat(0.6), hp: 0.1 })
    expect(merged).toEqual({ ...flat(0.6), hp: 0.9 })
    expect(mergePotential(null, flat(0.1)).hp).toBe(0.5)
  })

  it('gives the fused monster the merged potential', () => {
    const ultimate = (potential: IPotential | null) => ({
      ...adult(potential),
      speciesId: 'flame_ultimate',
      stage: EnumMonsterStage.ULTIMATE,
    })
    const first = ultimate(flat(0.3))
    const second = ultimate(flat(0.8))
    expect(createFused(first, second, first, NOW).potential).toEqual(flat(0.8))
  })
})

describe('view', () => {
  it('reports min, max and the rolled value per stat for the form', () => {
    const base = getSpecies('flame_adultGood').stats
    const view = buildPotentialView(base, flat(1))
    expect(view.grade).toBe('S')
    expect(view.stats.hp).toEqual({
      min: Math.round(base.hp * 0.9),
      max: Math.round(base.hp * 1.1),
      value: Math.round(base.hp * 1.1),
    })
    expect(view.stats.critRate).toEqual({ min: 15, max: 25, value: 25 })
    expect(view.stats.critDamage).toEqual({ min: 150, max: 180, value: 180 })
    expect(view.stats.evasion).toEqual({ min: 0, max: 5, value: 5 })
  })

  it('has no grade for a legacy monster and shows its old values', () => {
    const view = buildPotentialView(getSpecies('flame_adultGood').stats, null)
    expect(view.isLegacy).toBe(true)
    expect(view.grade).toBeNull()
    expect(view.stats.critRate.value).toBe(15)
  })
})

describe('evasion hook', () => {
  const attacker = toFighter(adult(null))
  const dodger = { ...attacker, effects: { evasion: 1 } }

  it('dodges every hit at 100% without spending a crit or variance roll', () => {
    const calls: number[] = []
    const rng = () => (calls.push(1), 0.5)
    const hit = rollHit(attacker, dodger, false, rng)
    expect(hit).toMatchObject({ damage: 0, isDodged: true })
    expect(calls).toHaveLength(1)
  })

  it('draws nothing for a defender without evasion, so old fights replay the same', () => {
    const plain = simulateBattle(attacker, attacker, 7)
    const zero = simulateBattle(attacker, { ...attacker, effects: { evasion: 0 } }, 7)
    expect(zero).toEqual(plain)
    expect(createRng(7)()).toBeGreaterThanOrEqual(0)
  })

  it('records dodged hits as zero-damage events', () => {
    const result = simulateBattle(attacker, dodger, 3)
    const onDodger = result.events.filter(event => event.actor === 'player')
    expect(onDodger.length).toBeGreaterThan(0)
    expect(onDodger.every(event => event.isDodged && event.damage === 0)).toBe(true)
  })
})
