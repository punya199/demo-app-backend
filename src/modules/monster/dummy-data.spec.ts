import { IArenaResult } from './arena/arena-types'
import { asDummyOf, DUMMY_HP, plainDummy, summarizeDummyFight } from './dummy-data'
import { getWorldBossArena, WORLD_BOSS_ROTATION } from './world-boss-data'

describe('training dummy', () => {
  it('never attacks: no ATK, skills, dodge or on-hit effects, but keeps the boss defence', () => {
    const boss = WORLD_BOSS_ROTATION.find(entry => entry.shield)!
    const spec = getWorldBossArena(boss, boss.hp)
    const dummy = asDummyOf(spec)
    expect(dummy.atk).toBe(0)
    expect(dummy.skills).toEqual([])
    expect(dummy.dodge).toBeNull()
    expect(dummy.hp).toBe(DUMMY_HP)
    expect(dummy.def).toBe(spec.def)
    expect(dummy.passive?.flatShield).toBe(spec.passive?.flatShield)
    expect(dummy.passive?.rage).toBeUndefined()
  })

  it('has the DEF and element it was given', () => {
    expect(plainDummy(80, 'tide')).toMatchObject({ def: 80, element: 'tide', atk: 0 })
  })

  it('sums up the player hits', () => {
    const arena = {
      ticks: 600,
      fighters: [{ dealt: 300 }],
      events: [
        { t: 1, kind: 'hit', who: 0, dmg: 100, crit: true, skill: 'A' },
        { t: 2, kind: 'hit', who: 0, dmg: 200 },
        { t: 3, kind: 'hit', who: 1, dmg: 999 },
      ],
    } as unknown as IArenaResult
    const summary = summarizeDummyFight(arena)
    expect(summary).toMatchObject({ totalDamage: 300, hits: 2, crits: 1, avgHit: 150 })
    expect(summary.bestHit).toEqual({ damage: 200, skill: null })
    expect(summary.dps).toBeGreaterThan(0)
  })
})
