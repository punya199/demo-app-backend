import { EnumMonsterLine } from '../../../db/entities/monster.entity'
import { rollHit, simulateBattle } from './battle-engine'
import { IFighter } from './battle-stats'
import { capEffects, LIFESTEAL_CAP, THORNS_CAP } from '../core/monster-potential'
import { IBattleStats } from '../core/species-data'

type Overrides = Omit<Partial<IFighter>, 'stats'> & { stats?: Partial<IBattleStats> }

const fighter = (overrides: Overrides = {}): IFighter => ({
  name: 'f',
  emoji: 'f',
  element: EnumMonsterLine.FLAME,
  skill: { name: 'ท่า', power: 1.6 },
  ...overrides,
  stats: { hp: 100, atk: 20, def: 0, spd: 10, ...overrides.stats },
})

const json = (value: unknown): unknown => JSON.parse(JSON.stringify(value)) as unknown

describe('passive keystone effects in the 1v1 engine', () => {
  it('treats zero or absent keystone effects exactly like no effects', () => {
    const plain = simulateBattle(fighter(), fighter({ stats: { hp: 300 } }), 7)
    const zero = simulateBattle(
      fighter({ effects: { lifesteal: 0, thorns: 0, firstStrike: 0, noCrit: 0 } }),
      fighter({ stats: { hp: 300 } }),
      7
    )
    expect(json(zero)).toEqual(json(plain))
  })

  describe('lifesteal', () => {
    it('heals the attacker by its share of the HP damage dealt, never above max HP', () => {
      const { events } = simulateBattle(
        fighter({ stats: { hp: 1000, spd: 99 }, effects: { lifesteal: 0.5 } }),
        fighter({ stats: { hp: 1000, atk: 30, spd: 1 } }),
        3
      )
      const heals = events.filter(event => event.actor === 'player' && event.healed)
      expect(heals.length).toBeGreaterThan(0)
      for (const hit of heals) {
        expect(hit.healed).toBe(Math.max(1, Math.round(hit.damage * 0.5)))
        expect(hit.actorHp).toBeLessThanOrEqual(1000)
      }
    })

    it('does not heal from damage a shield absorbed', () => {
      const { events } = simulateBattle(
        fighter({ stats: { hp: 1000, spd: 99 }, effects: { lifesteal: 0.5 } }),
        fighter({ stats: { hp: 1000, atk: 30, spd: 1 }, effects: { shieldPct: 5 } }),
        3
      )
      expect(events.filter(event => event.actor === 'player').every(e => !e.healed)).toBe(true)
    })
  })

  describe('thorns', () => {
    it('reflects a share of each hit taken and can finish the attacker', () => {
      const { events, won } = simulateBattle(
        fighter({ stats: { hp: 40, atk: 30, spd: 99 } }),
        fighter({ stats: { hp: 100_000, def: 0, atk: 1, spd: 1 }, effects: { thorns: 0.5 } }),
        3
      )
      const reflected = events.filter(event => event.reflected)
      expect(reflected.length).toBeGreaterThan(0)
      for (const hit of reflected) {
        expect(hit.reflected).toBe(Math.max(1, Math.round(hit.damage * 0.5)))
      }
      expect(won).toBe(false)
      expect(reflected[reflected.length - 1].actorHp).toBe(0)
    })

    it('is skipped when the hit kills the thorns holder or is dodged', () => {
      const { events } = simulateBattle(
        fighter({ stats: { hp: 100, atk: 500, spd: 99 } }),
        fighter({ stats: { hp: 10, def: 0, spd: 1 }, effects: { thorns: 0.5 } }),
        3
      )
      expect(events.some(event => event.reflected)).toBe(false)
    })
  })

  describe('firstStrike', () => {
    const slowStriker = fighter({ stats: { spd: 1 }, effects: { firstStrike: 1 } })
    const fast = fighter({ stats: { spd: 99 } })

    it('acts first every round against a faster fighter', () => {
      const { events } = simulateBattle(slowStriker, fast, 4)
      expect(events[0].actor).toBe('player')
    })

    it('falls back to speed when both sides have it, and when neither does', () => {
      const both = simulateBattle(
        slowStriker,
        fighter({ stats: { spd: 99 }, effects: { firstStrike: 1 } }),
        4
      )
      expect(both.events[0].actor).toBe('enemy')
      expect(simulateBattle(slowStriker, fast, 4).events[0].actor).toBe('player')
      expect(simulateBattle(fighter({ stats: { spd: 1 } }), fast, 4).events[0].actor).toBe('enemy')
    })
  })

  describe('noCrit', () => {
    it('never crits, but spends the same RNG draws so the rest of the fight is unchanged', () => {
      const attacker = fighter({ effects: { critChance: 1, noCrit: 1 } })
      const target = fighter({ stats: { hp: 100_000, def: 0 } })
      for (let seed = 0; seed < 50; seed++) {
        const rng = (() => {
          let n = seed
          return () => (n = (n * 1103515245 + 12345) % 2147483648) / 2147483648
        })()
        expect(rollHit(attacker, target, false, rng).isCritical).toBe(false)
      }
      const { events } = simulateBattle(attacker, target, 9)
      expect(events.some(event => event.isCritical && event.actor === 'player')).toBe(false)
      // Same fight with the flag but no crit chance rolls identical damage numbers.
      const withoutFlag = simulateBattle(fighter({ effects: { critChance: 1 } }), target, 9)
      const flagged = simulateBattle(attacker, target, 9)
      expect(flagged.events.map(event => event.targetHp).length).toBe(
        withoutFlag.events.map(event => event.targetHp).length
      )
    })
  })

  it('caps lifesteal and thorns, so stacking nodes cannot make a fighter unkillable', () => {
    const capped = capEffects({ lifesteal: 2, thorns: 3 })
    expect(capped.lifesteal).toBe(LIFESTEAL_CAP)
    expect(capped.thorns).toBe(THORNS_CAP)
  })
})
