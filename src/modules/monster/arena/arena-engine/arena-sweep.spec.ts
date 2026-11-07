import { ARENA_SKILLS } from '../arena-data'
import { IArenaFighterSpec, IArenaPassive } from '../arena-types'
import { simulateArena } from './index'

// Every skill and dodge in the catalog goes through real fights, against a sturdy and an
// aggressive foe, with and without passives. Each fight must be valid and replay identically.

const spec = (over: Partial<IArenaFighterSpec> = {}): IArenaFighterSpec => ({
  name: 'a',
  emoji: 'a',
  element: 'flame',
  hp: 300,
  atk: 30,
  def: 20,
  spd: 12,
  eva: 5,
  acc: 8,
  res: 8,
  skills: [],
  dodge: null,
  ...over,
})
const sturdy = (over: Partial<IArenaFighterSpec> = {}) =>
  spec({ name: 'wall', element: 'tide', hp: 900, atk: 12, def: 40, ...over })
const brute = (over: Partial<IArenaFighterSpec> = {}) =>
  spec({ name: 'brute', element: 'leaf', hp: 500, atk: 60, spd: 14, ...over })

const actives = ARENA_SKILLS.filter(skill => skill.slot !== 'dodge')
const dodges = ARENA_SKILLS.filter(skill => skill.slot === 'dodge')

const run = (teams: IArenaFighterSpec[][], seed: number) => {
  const first = simulateArena(teams, seed, { record: true })
  const again = simulateArena(teams, seed)
  expect(again.checksum).toBe(first.checksum)
  expect(again.winner).toBe(first.winner)
  expect([0, 1, -1]).toContain(first.winner)
  expect(first.ticks).toBeGreaterThan(0)
  return first
}

describe('arena skill sweep', () => {
  it.each(actives.map(skill => [skill.id, skill] as const))('fights with %s', (id, skill) => {
    const mine = spec({ element: skill.el === 'neutral' ? 'flame' : skill.el, skills: [id] })
    const seeds = [1, 2, 3]
    for (const seed of seeds) {
      run([[mine], [sturdy()]], seed)
      run([[mine], [brute({ skills: [id] })]], seed)
    }
  })

  it.each(dodges.map(skill => [skill.id] as const))('fights with the %s dodge', id => {
    for (const seed of [1, 2, 3, 4]) {
      run([[spec({ dodge: id, skills: ['n_tackle'] })], [brute({ skills: ['leaf_claw'] })]], seed)
      run([[brute({ dodge: id })], [spec({ skills: ['flame_tail'] })]], seed)
    }
  })
})

describe('arena passive sweep', () => {
  const passives: IArenaPassive[] = [
    { rebirthPct: 40, regenPct: 2, damageCut: 20, tenacity: 50, moveCut: 20 },
    { basicLifesteal: 30, eva: 20, dodgeCdCut: 3, doubleStrike: 100, startShield: 30 },
    { meleeRetort: { power: 50, st: 'blind', dur: 2, ch: 100 }, thorns: 30, attackSpeed: 30 },
    { onBasic: { st: 'burn', dur: 3, ch: 100 }, bonusVsStatus: { st: 'burn', pct: 30 } },
    { onBasic: { st: 'poison', dur: 4, ch: 100 }, bonusVsStatus: { st: 'poison', pct: 30 } },
    { lastStand: { belowPct: 50, shield: 30, immuneSec: 2 }, firstStrike: true, cdCut: 20 },
    { enrage: { belowPct: 60, atk: 50 }, rage: { sec: 3, atk: 50 }, flatShield: 200 },
    { grow: { secs: [3, 6], atk: 10, def: 10 }, shieldEvery: { pct: 10, sec: 4 } },
    {
      afterDodge: { critNext: true, bonus: 50 },
      critDamage: 50,
      executeVs: { belowPct: 50, pct: 50 },
    },
    { noCrit: true, regenPct: 3 },
    {
      onBasicExtra: [
        { st: 'slow', dur: 3, ch: 100 },
        { st: 'defDown', dur: 3, ch: 100 },
        { st: 'curse', dur: 3, ch: 100 },
        { st: 'stun', dur: 2, ch: 100 },
        { st: 'blind', dur: 2, ch: 100 },
      ],
    },
  ]

  it.each(passives.map((passive, index) => [index, passive] as const))(
    'passive set %i holds up on both sides',
    (_index, passive) => {
      for (const seed of [1, 2, 3]) {
        const skills = ['flame_tail', 'flame_lava', 'n_tackle']
        run(
          [[spec({ passive, skills, dodge: 'dg_step' })], [brute({ skills: ['leaf_claw'] })]],
          seed
        )
        run(
          [[spec({ skills })], [brute({ passive, skills: ['leaf_claw'], dodge: 'dg_parry' })]],
          seed
        )
      }
    }
  )

  it('fights in teams of two', () => {
    const team = [spec({ skills: ['flame_tail', 'n_tackle'] }), spec({ skills: ['n_guard'] })]
    const other = [brute({ skills: ['leaf_claw'] }), sturdy({ skills: ['tide_ink'] })]
    for (const seed of [1, 2]) {
      run([team, other], seed)
    }
  })
})
