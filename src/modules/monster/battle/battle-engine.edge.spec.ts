import { EnumMonsterLine } from '../../../db/entities/monster.entity'
import { CRITICAL_CHANCE, IBattleEvent, MAX_ROUNDS, rollHit, simulateBattle } from './battle-engine'
import { IFighter } from './battle-stats'
import { IBattleStats } from '../core/species-data'

type Overrides = Omit<Partial<IFighter>, 'stats'> & { stats?: Partial<IBattleStats> }

// Earth vs earth: always a normal-effectiveness hit.
const fighter = (overrides: Overrides = {}): IFighter => ({
  name: 'f',
  emoji: 'f',
  element: EnumMonsterLine.EARTH,
  skill: { name: 'ท่า', power: 1.6 },
  ...overrides,
  stats: { hp: 100, atk: 20, def: 0, spd: 10, ...overrides.stats },
})
const last = (events: IBattleEvent[]) => events[events.length - 1]

describe('rollHit evasion', () => {
  const dodger = fighter({ effects: { evasion: 0.5 } })

  it('dodges when the evasion roll is under the evasion, spending no other roll', () => {
    const rng = jest.fn().mockReturnValue(0.4)
    const hit = rollHit(fighter(), dodger, false, rng)
    expect(hit).toEqual({ damage: 0, isCritical: false, effectiveness: 'normal', isDodged: true })
    expect(rng).toHaveBeenCalledTimes(1)
  })

  it('gets hit when the roll is at or over the evasion, then rolls crit and variance', () => {
    const rng = jest.fn().mockReturnValue(0.5)
    const hit = rollHit(fighter(), dodger, false, rng)
    expect(hit.isDodged).toBeUndefined()
    expect(hit.damage).toBeGreaterThan(0)
    expect(rng).toHaveBeenCalledTimes(3)
  })

  it('applies the attacker crit chance bonus and crit damage bonus', () => {
    const plain = rollHit(fighter(), fighter(), false, () => CRITICAL_CHANCE + 0.01)
    expect(plain.isCritical).toBe(false)
    const lucky = fighter({ effects: { critChance: 0.1, critDamage: 1 } })
    const crit = rollHit(lucky, fighter(), false, () => CRITICAL_CHANCE + 0.01)
    expect(crit.isCritical).toBe(true)
    expect(crit.damage).toBeGreaterThan(plain.damage * 1.5)
    const noCrit = fighter({ effects: { critChance: 1, noCrit: 1 } })
    expect(rollHit(noCrit, fighter(), false, () => 0).isCritical).toBe(false)
  })

  it('ignores the element triangle on request', () => {
    const flame = fighter({ element: EnumMonsterLine.FLAME })
    const leaf = fighter({ element: EnumMonsterLine.LEAF })
    expect(rollHit(flame, leaf, false, () => 0.5).effectiveness).toBe('strong')
    expect(rollHit(flame, leaf, false, () => 0.5, true).effectiveness).toBe('normal')
  })
})

describe('simulateBattle edge cases', () => {
  it('marks dodged hits in the replay', () => {
    const result = simulateBattle(fighter(), fighter({ effects: { evasion: 1 } }), 3)
    const hits = result.events.filter(event => event.actor === 'player')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every(event => event.isDodged && event.damage === 0)).toBe(true)
    // nobody ever lands a hit on the dodger, so the challenger fails after the round limit
    expect(result.won).toBe(false)
  })

  it('lets a burn tick finish the burned fighter at the start of its turn', () => {
    // The enemy's skill barely hurts but sets the player alight for 10 per tick (25% of 40 ATK).
    const player = fighter({ stats: { hp: 71, atk: 1, spd: 1 } })
    const enemy = fighter({
      effects: { burnTurns: 20 },
      stats: { hp: 5000, atk: 40, spd: 20 },
      skill: { name: 'ไฟ', power: 0.01 },
    })
    const result = simulateBattle(player, enemy, 6)
    expect(result.won).toBe(false)
    expect(result.rounds).toBe(3)
    expect(last(result.events)).toMatchObject({ kind: 'burn', targetHp: 0, damage: 10 })
  })

  it('wins when an extra double strike drops the target', () => {
    const attacker = fighter({ effects: { doubleStrikeChance: 1 }, stats: { hp: 500, spd: 20 } })
    const target = fighter({ stats: { hp: 18, atk: 1, spd: 1 } })
    const result = simulateBattle(attacker, target, 1)
    expect(result.won).toBe(true)
    expect(result.rounds).toBe(1)
    expect(last(result.events)).toMatchObject({ kind: 'double', actor: 'player', targetHp: 0 })
  })

  it('loses when the thorns on an extra double strike drop the attacker', () => {
    const attacker = fighter({
      effects: { doubleStrikeChance: 1 },
      stats: { hp: 5, atk: 8, spd: 20 },
    })
    const target = fighter({ effects: { thorns: 0.5 }, stats: { hp: 5000, atk: 1, spd: 1 } })
    const result = simulateBattle(attacker, target, 1)
    expect(result.won).toBe(false)
    expect(last(result.events)).toMatchObject({ kind: 'double', actor: 'player', actorHp: 0 })
    expect(last(result.events).reflected).toBeGreaterThan(0)
  })

  it('fails the challenger when nobody falls within the round limit', () => {
    const wall = fighter({ stats: { hp: 100_000, def: 1000 } })
    const result = simulateBattle(wall, wall, 1)
    expect(result.won).toBe(false)
    expect(result.rounds).toBe(MAX_ROUNDS)
  })
})
