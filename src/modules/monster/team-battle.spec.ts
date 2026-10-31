import { EnumMonsterLine } from '../../db/entities/monster.entity'
import { IFighter } from './battle-stats'
import { IBattleStats } from './species-data'
import { simulateTeamBattle } from './team-battle'

type Overrides = Omit<Partial<IFighter>, 'stats'> & { stats?: Partial<IBattleStats> }

const fighter = (overrides: Overrides = {}): IFighter => ({
  name: 'f',
  emoji: 'f',
  element: EnumMonsterLine.FLAME,
  skill: { name: 'ท่า', power: 1.6 },
  ...overrides,
  stats: { hp: 200, atk: 30, def: 5, spd: 10, ...overrides.stats },
})

const boss = (hp: number, overrides: Overrides = {}) =>
  fighter({
    name: 'boss',
    ...overrides,
    stats: { atk: 20, def: 10, spd: 5, ...overrides.stats, hp },
  })

describe('simulateTeamBattle', () => {
  it('replays the same fight from the same seed and differs between seeds', () => {
    const run = (seed: number) => simulateTeamBattle([fighter()], boss(100_000), seed, 10)
    expect(run(4)).toEqual(run(4))
    expect(run(4).events).not.toEqual(run(5).events)
  })

  it('reports exactly the HP the boss lost as damage dealt', () => {
    const result = simulateTeamBattle([fighter()], boss(100_000), 1, 10)
    expect(result.damageDealt).toBeGreaterThan(0)
    expect(result.bossHpAfter).toBe(100_000 - result.damageDealt)
    expect(result.bossDefeated).toBe(false)
    const dealt = result.events
      .filter(event => event.actor === 'player' && event.kind !== 'regen')
      .reduce((sum, event) => sum + event.damage, 0)
    expect(dealt).toBe(result.damageDealt)
  })

  it('can defeat a boss with little HP left, capping the damage at what was left', () => {
    const result = simulateTeamBattle([fighter()], boss(40), 1, 10)
    expect(result.bossDefeated).toBe(true)
    expect(result.bossHpAfter).toBe(0)
    expect(result.damageDealt).toBe(40)
    expect(result.rounds).toBeLessThanOrEqual(2)
  })

  it('ends when the whole team is down and keeps the damage done so far', () => {
    const frail = fighter({ stats: { hp: 30, def: 0 } })
    const brutal = boss(100_000, { stats: { atk: 80, spd: 99 } })
    const result = simulateTeamBattle([frail], brutal, 1, 10)
    expect(result.survivors).toEqual([])
    expect(result.rounds).toBeLessThan(10)
    expect(result.bossDefeated).toBe(false)
  })

  it('runs for the round limit when nobody falls', () => {
    const tough = fighter({ stats: { hp: 100_000, def: 1000 } })
    const result = simulateTeamBattle([tough], boss(100_000), 1, 10)
    expect(result.rounds).toBe(10)
    expect(result.survivors).toEqual([0])
  })

  it('lets a second team member add damage, and the boss only ever hits members still standing', () => {
    const alone = simulateTeamBattle([fighter()], boss(100_000), 3, 10)
    const pair = simulateTeamBattle(
      [fighter(), fighter({ stats: { spd: 9 } })],
      boss(100_000),
      3,
      10
    )
    expect(pair.damageDealt).toBeGreaterThan(alone.damageDealt)

    const fragile = fighter({ stats: { hp: 1, def: 0, spd: 1 } })
    const sturdy = fighter({ stats: { hp: 100_000, def: 1000, spd: 2 } })
    const events = simulateTeamBattle(
      [fragile, sturdy],
      boss(100_000, { stats: { atk: 50 } }),
      7,
      10
    ).events
    let fragileDown = false
    for (const event of events) {
      if (event.actor === 'enemy' && event.member === 0 && fragileDown) {
        throw new Error('the boss hit a member that was already down')
      }
      if (event.actor === 'enemy' && event.member === 0 && event.targetHp === 0) {
        fragileDown = true
      }
    }
    expect(fragileDown).toBe(true)
  })

  it('orders turns by speed, team first on a tie', () => {
    const result = simulateTeamBattle([fighter({ stats: { spd: 5 } })], boss(100_000), 2, 1)
    expect(result.events[0].actor).toBe('player')
    const faster = simulateTeamBattle(
      [fighter({ stats: { spd: 1 } })],
      boss(100_000, { stats: { spd: 50 } }),
      2,
      1
    )
    expect(faster.events[0].actor).toBe('enemy')
  })

  it('counts burn damage as damage dealt, and gives a member shield and regen like 1-vs-1', () => {
    const burner = fighter({ stats: { spd: 99 }, effects: { burnTurns: 3 } })
    const result = simulateTeamBattle([burner], boss(100_000, { stats: { def: 1000 } }), 1, 10)
    const burns = result.events.filter(event => event.kind === 'burn')
    expect(burns.length).toBeGreaterThan(0)
    expect(burns.every(event => event.actor === 'player')).toBe(true)

    const shielded = fighter({ stats: { hp: 100 }, effects: { shieldPct: 0.5 } })
    const hit = simulateTeamBattle([shielded], boss(100_000, { stats: { atk: 40, spd: 99 } }), 1, 1)
    expect(hit.events.find(event => event.actor === 'enemy')?.absorbed).toBeGreaterThan(0)
  })

  it('tags every event with a valid team member index', () => {
    const team = [fighter(), fighter(), fighter()]
    const { events } = simulateTeamBattle(team, boss(100_000), 9, 10)
    expect(events.every(event => event.member >= 0 && event.member < team.length)).toBe(true)
  })
})
