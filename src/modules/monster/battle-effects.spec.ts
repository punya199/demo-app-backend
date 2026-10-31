import { EnumMonsterLine } from '../../db/entities/monster.entity'
import { BURN_DAMAGE_ATK_RATIO, IBattleEvent, simulateBattle } from './battle-engine'
import { IFighter, IFighterEffects } from './battle-stats'
import { IBattleStats } from './species-data'

type FighterOverrides = Omit<Partial<IFighter>, 'stats'> & { stats?: Partial<IBattleStats> }

const fighter = (overrides: FighterOverrides = {}): IFighter => ({
  name: 'f',
  emoji: 'f',
  element: EnumMonsterLine.FLAME,
  skill: { name: 'ท่า', power: 1.6 },
  ...overrides,
  stats: { hp: 100, atk: 20, def: 0, spd: 10, ...overrides.stats },
})

// A target that survives the whole fight, so effects show up over all 20 rounds.
const punchingBag = (overrides: FighterOverrides = {}) =>
  fighter({
    element: EnumMonsterLine.FLAME,
    ...overrides,
    stats: { hp: 100_000, atk: 1, def: 1000, spd: 1, ...overrides.stats },
  })

const kinds = (events: IBattleEvent[], kind: string) => events.filter(event => event.kind === kind)

describe('set effects in the battle engine', () => {
  it('treats empty or zero effects exactly like no effects', () => {
    const plain = simulateBattle(fighter(), punchingBag(), 5)
    const empty = simulateBattle(fighter({ effects: {} }), punchingBag({ effects: {} }), 5)
    const zero = simulateBattle(
      fighter({ effects: { doubleStrikeChance: 0, shieldPct: 0, regenPct: 0 } }),
      punchingBag(),
      5
    )
    expect(JSON.parse(JSON.stringify(empty))).toEqual(JSON.parse(JSON.stringify(plain)))
    expect(JSON.parse(JSON.stringify(zero))).toEqual(JSON.parse(JSON.stringify(plain)))
  })

  describe('burn', () => {
    const burner = fighter({ stats: { atk: 20, spd: 99 }, effects: { burnTurns: 3 } })

    it('ticks on the burned fighter’s turns for 3 turns after each skill hit, ignoring defense', () => {
      const { events } = simulateBattle(burner, punchingBag(), 1)
      const ticks = kinds(events, 'burn')
      // skills land in rounds 3, 6, ..., 18; each leaves 3 ticks (that round and the next two)
      expect(ticks).toHaveLength(18)
      expect(ticks.every(tick => tick.actor === 'player')).toBe(true)
      expect(ticks.every(tick => tick.damage === Math.round(20 * BURN_DAMAGE_ATK_RATIO))).toBe(true)
      expect(new Set(ticks.map(tick => tick.round)).size).toBe(ticks.length)
    })

    it('renews instead of stacking when a second skill lands while burning', () => {
      const frequent = fighter({ stats: { atk: 20, spd: 99 }, effects: { burnTurns: 5 } })
      const { events } = simulateBattle(frequent, punchingBag(), 1)
      const perRound = new Map<number, number>()
      for (const tick of kinds(events, 'burn')) {
        perRound.set(tick.round, (perRound.get(tick.round) ?? 0) + 1)
      }
      expect([...perRound.values()].every(count => count === 1)).toBe(true)
    })

    it('can finish the fight, crediting the burner', () => {
      const frail = punchingBag({ stats: { hp: 30, def: 1000 } })
      const { won, events } = simulateBattle(burner, frail, 1)
      expect(won).toBe(true)
      expect(events[events.length - 1].targetHp).toBe(0)
    })

    it('does not burn without skill hits or without the effect', () => {
      expect(kinds(simulateBattle(fighter(), punchingBag(), 1).events, 'burn')).toHaveLength(0)
    })
  })

  describe('shield', () => {
    it('soaks damage before HP, up to 15% of max HP when configured so', () => {
      const shielded = punchingBag({ stats: { hp: 200, def: 0 }, effects: { shieldPct: 0.5 } })
      const { events } = simulateBattle(fighter({ stats: { atk: 20, spd: 99 } }), shielded, 3)
      const first = events.find(event => event.actor === 'player')!
      expect(first.absorbed).toBe(Math.min(100, first.damage))
      expect(first.targetHp).toBe(200 - (first.damage - (first.absorbed ?? 0)))
      const totalAbsorbed = events.reduce((sum, event) => sum + (event.absorbed ?? 0), 0)
      expect(totalAbsorbed).toBeLessThanOrEqual(100)
      expect(totalAbsorbed).toBe(100)
    })

    it('shows no absorbed field on events when there is no shield', () => {
      const { events } = simulateBattle(fighter(), punchingBag(), 3)
      expect(events.some(event => 'absorbed' in event)).toBe(false)
    })
  })

  describe('regen', () => {
    it('heals a share of max HP each own turn and never above max', () => {
      const tank = fighter({
        stats: { hp: 1000, atk: 1, def: 1000, spd: 1 },
        effects: { regenPct: 0.05 },
      })
      const hitter = fighter({ stats: { atk: 60, spd: 99 } })
      const { events } = simulateBattle(hitter, tank, 2)
      const heals = kinds(events, 'regen')
      expect(heals.length).toBeGreaterThan(0)
      expect(heals.every(heal => heal.damage <= 50)).toBe(true)
      expect(heals.every(heal => heal.targetHp <= 1000)).toBe(true)
    })

    it('does nothing while HP is full', () => {
      // The regenerating fighter acts first in round 1, before it has taken any damage.
      const fresh = fighter({ stats: { spd: 99 }, effects: { regenPct: 0.5 } })
      const { events } = simulateBattle(fresh, punchingBag(), 2)
      expect(events.filter(event => event.round === 1 && event.kind === 'regen')).toHaveLength(0)
    })
  })

  describe('double strike', () => {
    it('adds one extra basic hit after each attack and never chains', () => {
      const swift = fighter({ stats: { atk: 20, spd: 99 }, effects: { doubleStrikeChance: 1 } })
      const { events } = simulateBattle(swift, punchingBag(), 4)
      const playerEvents = events.filter(event => event.actor === 'player')
      // every attack is followed by exactly one double, then the next attack
      playerEvents.forEach((event, index) => {
        expect(event.kind).toBe(index % 2 === 1 ? 'double' : undefined)
      })
      expect(kinds(events, 'double').every(event => !event.isSkill)).toBe(true)
    })

    it('is rolled from the seeded RNG, so the same seed replays the same fight', () => {
      const lucky: IFighterEffects = { doubleStrikeChance: 0.2 }
      const run = () => simulateBattle(fighter({ effects: lucky }), punchingBag(), 77)
      expect(run()).toEqual(run())
      const doubles = kinds(run().events, 'double').length
      expect(doubles).toBeGreaterThan(0)
      expect(doubles).toBeLessThan(20)
    })
  })
})
