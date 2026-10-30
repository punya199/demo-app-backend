import { EnumMonsterLine } from '../../db/entities/monster.entity'
import {
  createRng,
  getEffectiveness,
  MAX_ROUNDS,
  SKILL_EVERY_ROUNDS,
  simulateBattle,
} from './battle-engine'
import { IFighter } from './battle-stats'

interface IFighterOverrides extends Partial<Omit<IFighter, 'stats'>> {
  stats?: Partial<IFighter['stats']>
}

const fighter = (overrides: IFighterOverrides = {}): IFighter => ({
  name: 'tester',
  emoji: '🧪',
  element: EnumMonsterLine.FLAME,
  skill: { name: 'test skill', power: 1.6 },
  ...overrides,
  stats: { hp: 50, atk: 10, def: 5, spd: 10, ...overrides.stats },
})

describe('getEffectiveness', () => {
  it('follows flame > leaf > tide > flame', () => {
    expect(getEffectiveness(EnumMonsterLine.FLAME, EnumMonsterLine.LEAF)).toBe('strong')
    expect(getEffectiveness(EnumMonsterLine.LEAF, EnumMonsterLine.TIDE)).toBe('strong')
    expect(getEffectiveness(EnumMonsterLine.TIDE, EnumMonsterLine.FLAME)).toBe('strong')
    expect(getEffectiveness(EnumMonsterLine.LEAF, EnumMonsterLine.FLAME)).toBe('weak')
    expect(getEffectiveness(EnumMonsterLine.TIDE, EnumMonsterLine.TIDE)).toBe('normal')
  })
})

describe('createRng', () => {
  it('replays the same sequence for the same seed and stays within [0, 1)', () => {
    const a = createRng(42)
    const b = createRng(42)
    const values = Array.from({ length: 100 }, () => a())
    expect(values).toEqual(Array.from({ length: 100 }, () => b()))
    expect(values.every(value => value >= 0 && value < 1)).toBe(true)
  })
})

describe('simulateBattle', () => {
  it('is deterministic for a given seed', () => {
    const player = fighter()
    const enemy = fighter({ element: EnumMonsterLine.TIDE })
    expect(simulateBattle(player, enemy, 7)).toEqual(simulateBattle(player, enemy, 7))
  })

  it('ends as soon as one side drops to 0 HP and reports the winner', () => {
    const result = simulateBattle(
      fighter({ stats: { atk: 40 } }),
      fighter({ element: EnumMonsterLine.TIDE, stats: { hp: 30, atk: 1 } }),
      1
    )
    expect(result.won).toBe(true)
    const last = result.events[result.events.length - 1]
    expect(last.actor).toBe('player')
    expect(last.targetHp).toBe(0)
  })

  it('lets the faster fighter act first', () => {
    const result = simulateBattle(
      fighter({ stats: { spd: 5 } }),
      fighter({ element: EnumMonsterLine.TIDE, stats: { spd: 20 } }),
      3
    )
    expect(result.events[0].actor).toBe('enemy')
  })

  it('uses the skill every few rounds', () => {
    const { events } = simulateBattle(
      fighter({ stats: { hp: 500 } }),
      fighter({ element: EnumMonsterLine.TIDE, stats: { hp: 500 } }),
      5
    )
    for (const event of events) {
      expect(event.isSkill).toBe(event.round % SKILL_EVERY_ROUNDS === 0)
      expect(event.moveName).toBe(event.isSkill ? 'test skill' : 'โจมตี')
    }
  })

  it('always deals at least 1 damage', () => {
    const { events } = simulateBattle(
      fighter({ stats: { atk: 1 } }),
      fighter({ element: EnumMonsterLine.TIDE, stats: { def: 999 } }),
      9
    )
    expect(events.filter(event => event.actor === 'player').every(e => e.damage >= 1)).toBe(true)
  })

  it('counts a fight that outlasts the round limit as a loss', () => {
    const result = simulateBattle(
      fighter({ stats: { hp: 10_000, atk: 1 } }),
      fighter({ element: EnumMonsterLine.TIDE, stats: { hp: 10_000, atk: 1 } }),
      11
    )
    expect(result.won).toBe(false)
    expect(result.rounds).toBe(MAX_ROUNDS)
  })

  it('hits harder with an element advantage', () => {
    const tank = { hp: 10_000, def: 0 }
    const totalDamage = (element: EnumMonsterLine) =>
      simulateBattle(fighter(), fighter({ element, stats: tank }), 13)
        .events.filter(event => event.actor === 'player')
        .reduce((sum, event) => sum + event.damage, 0)

    expect(totalDamage(EnumMonsterLine.LEAF)).toBeGreaterThan(totalDamage(EnumMonsterLine.FLAME))
    expect(totalDamage(EnumMonsterLine.FLAME)).toBeGreaterThan(totalDamage(EnumMonsterLine.TIDE))
  })
})
