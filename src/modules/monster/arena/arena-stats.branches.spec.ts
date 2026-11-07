import { toArenaStatsView } from './arena-stats'
import { arenaEffectiveness, ARENA_BEATS, ARENA_STRONG, ARENA_WEAK } from './arena-rules'
import { IArenaFighterSpec } from './arena-types'

const spec = (passive?: IArenaFighterSpec['passive']): IArenaFighterSpec => ({
  name: 'S',
  emoji: 'S',
  element: 'flame',
  hp: 100,
  atk: 10,
  def: 5,
  spd: 5,
  eva: 1,
  acc: 2,
  res: 3,
  skills: [],
  dodge: null,
  passive,
})

describe('toArenaStatsView on hand-made specs', () => {
  it('reads a spec with no passive as all zeros', () => {
    const view = toArenaStatsView(spec())
    expect(view).toMatchObject({
      attackSpeed: 0,
      burnChance: 0,
      burnBonus: 0,
      poisonBonus: 0,
      regenPct: 0,
      regenPerSec: 0,
      onBasic: [],
      periodicShield: null,
      lastStand: null,
      firstStrike: false,
      noCrit: false,
    })
  })

  it('splits a burn basic from other on-basic statuses and reads the bonus per status', () => {
    const burning = toArenaStatsView(
      spec({
        onBasic: { st: 'burn', dur: 2, ch: 30 },
        bonusVsStatus: { st: 'burn', pct: 20 },
        onBasicExtra: [{ st: 'slow', dur: 2, ch: 10 }],
      })
    )
    expect(burning.burnChance).toBe(30)
    expect(burning.burnBonus).toBe(20)
    expect(burning.poisonBonus).toBe(0)
    expect(burning.onBasic).toEqual([{ status: 'slow', chance: 10 }])
  })

  it('lists a non-burn basic status first and reads the poison bonus and regen', () => {
    const view = toArenaStatsView(
      spec({
        onBasic: { st: 'poison', dur: 3, ch: 25 },
        bonusVsStatus: { st: 'poison', pct: 40 },
        regenPct: 2,
        shieldEvery: { pct: 5, sec: 8 },
        lastStand: { belowPct: 35, shield: 30, immuneSec: 2 },
      })
    )
    expect(view.burnChance).toBe(0)
    expect(view.poisonBonus).toBe(40)
    expect(view.burnBonus).toBe(0)
    expect(view.onBasic).toEqual([{ status: 'poison', chance: 25 }])
    expect(view.regenPerSec).toBe(6)
    expect(view.periodicShield).toEqual({ pct: 5, sec: 8 })
    expect(view.lastStand).toEqual({ belowPct: 35, shield: 30 })
  })
})

describe('arenaEffectiveness', () => {
  it('is neutral for a missing or neutral attacker', () => {
    expect(arenaEffectiveness(null, 'flame')).toBe(100)
    expect(arenaEffectiveness('neutral', 'flame')).toBe(100)
  })

  it('is strong against the line it beats, weak against one that beats it, else neutral', () => {
    const victim = ARENA_BEATS.flame[0]
    expect(arenaEffectiveness('flame', victim)).toBe(ARENA_STRONG)
    expect(arenaEffectiveness(victim, 'flame')).toBe(ARENA_WEAK)
    expect(arenaEffectiveness('flame', 'flame')).toBe(100)
  })
})
