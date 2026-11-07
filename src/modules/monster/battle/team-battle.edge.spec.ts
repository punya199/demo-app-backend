import { EnumMonsterLine } from '../../../db/entities/monster.entity'
import { IFighter } from './battle-stats'
import { IBattleStats } from '../core/species-data'
import { simulateTeamBattle } from './team-battle'

type Overrides = Omit<Partial<IFighter>, 'stats'> & { stats?: Partial<IBattleStats> }

const fighter = (overrides: Overrides = {}): IFighter => ({
  name: 'f',
  emoji: 'f',
  element: EnumMonsterLine.EARTH,
  skill: { name: 'ท่า', power: 1.6 },
  ...overrides,
  stats: { hp: 100, atk: 20, def: 0, spd: 10, ...overrides.stats },
})
const wall = (hp = 100_000) => fighter({ stats: { hp, atk: 1, def: 1000, spd: 1 } })
const SOFT_SKILL = { name: 'ไฟ', power: 0.01 }
const last = <T>(items: T[]) => items[items.length - 1]

describe('simulateTeamBattle set effects', () => {
  it('defeats the boss with a burn tick and credits it to whoever lit it', () => {
    const burner = fighter({
      effects: { burnTurns: 20 },
      stats: { atk: 40, spd: 20 },
      skill: SOFT_SKILL,
    })
    const result = simulateTeamBattle(
      [burner],
      fighter({ stats: { hp: 21, atk: 1, def: 1000, spd: 1 } }),
      1,
      20
    )
    expect(result.bossDefeated).toBe(true)
    expect(result.rounds).toBe(3)
    expect(last(result.events)).toMatchObject({ kind: 'burn', targetHp: 0, actor: 'player' })
    expect(result.damageByMember).toEqual([21])
    expect(result.damageDealt).toBe(21)
  })

  it('lets a burn kill one member while the rest keep fighting', () => {
    const frail = fighter({ stats: { hp: 2, atk: 1, spd: 1 } })
    const boss = fighter({
      effects: { burnTurns: 20 },
      stats: { hp: 100_000, atk: 40, spd: 20, def: 1000 },
      skill: SOFT_SKILL,
    })
    const result = simulateTeamBattle([frail, wall()], boss, 1, 20)
    const burnDeath = result.events.find(event => event.kind === 'burn' && event.targetHp === 0)!
    expect(burnDeath.actor).toBe('enemy')
    expect(burnDeath.member).toBe(0)
    expect(result.survivors).toEqual([1])
    expect(result.rounds).toBe(20)
  })

  it('heals a damaged member and a damaged boss with regeneration', () => {
    const healer = fighter({ effects: { regenPct: 0.05 }, stats: { hp: 300 } })
    const regenBoss = fighter({
      effects: { regenPct: 0.05 },
      stats: { hp: 100_000, atk: 20 },
    })
    const result = simulateTeamBattle([healer], regenBoss, 1, 20)
    const regens = result.events.filter(event => event.kind === 'regen')
    expect(regens.some(event => event.actor === 'enemy')).toBe(true)
    expect(regens.some(event => event.actor === 'player' && event.member === 0)).toBe(true)
    expect(regens.every(event => event.damage > 0)).toBe(true)
  })

  it('drops a member whose own attack is answered by lethal thorns, leaving the rest', () => {
    const rash = fighter({ stats: { hp: 1, atk: 30, spd: 20 } })
    const boss = fighter({ effects: { thorns: 0.5 }, stats: { hp: 100_000, atk: 1, spd: 1 } })
    const result = simulateTeamBattle([rash, wall()], boss, 1, 20)
    const fall = result.events.find(event => event.actor === 'player' && event.actorHp === 0)!
    expect(fall.member).toBe(0)
    expect(result.survivors).toEqual([1])
  })

  it('wins with an extra double strike that drops the boss', () => {
    const striker = fighter({ effects: { doubleStrikeChance: 1 }, stats: { hp: 500, spd: 20 } })
    const result = simulateTeamBattle(
      [striker],
      fighter({ stats: { hp: 18, atk: 1, spd: 1 } }),
      1,
      20
    )
    expect(result.bossDefeated).toBe(true)
    expect(result.rounds).toBe(1)
    expect(last(result.events)).toMatchObject({ kind: 'double', targetHp: 0 })
  })

  it('drops a member to the thorns of its own double strike, leaving the rest', () => {
    const striker = fighter({
      effects: { doubleStrikeChance: 1 },
      stats: { hp: 5, atk: 8, spd: 20 },
    })
    const boss = fighter({ effects: { thorns: 0.5 }, stats: { hp: 100_000, atk: 1, spd: 1 } })
    const result = simulateTeamBattle([striker, wall()], boss, 1, 20)
    const fall = result.events.find(event => event.kind === 'double' && event.actorHp === 0)!
    expect(fall.member).toBe(0)
    expect(result.survivors).toEqual([1])
  })

  it('marks dodged hits and credits no damage for them', () => {
    const dodger = fighter({ effects: { evasion: 1 }, stats: { hp: 1000, atk: 1, spd: 1 } })
    const result = simulateTeamBattle([fighter()], dodger, 1, 5)
    const hits = result.events.filter(event => event.actor === 'player')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every(event => event.isDodged && event.damage === 0)).toBe(true)
    expect(result.damageDealt).toBe(0)
    expect(result.bossDefeated).toBe(false)
  })
})
