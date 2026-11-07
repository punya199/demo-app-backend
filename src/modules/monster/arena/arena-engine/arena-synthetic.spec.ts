import { ARENA_TUNING } from '../arena-data'
import { IArenaFighterSpec, IArenaSkill } from '../arena-types'
import { ARENA_SKILL_BY_ID, tunedSkill } from './index'
import { simulateArena } from './index'

// Hand-built skills that leave out every optional field, so the engine's defaults run, plus
// status interactions (curse, immunity, cleansing) that the catalog rarely lines up.

const base = {
  name: 'x',
  icon: 'x',
  el: '' as never,
  src: 'enemy',
  slot: 'active' as const,
  cd: 1,
  wind: 4,
}
const KINDS = ['melee', 'multi', 'shot', 'spread', 'burst', 'beam', 'zone', 'charge'] as const
const SKILLS: IArenaSkill[] = [
  ...KINDS.map(kind => ({ ...base, id: `zz_${kind}`, kind })),
  { ...base, id: 'zz_cleanse', kind: 'self', cleanse: true, heal: 30, shield: 20 },
  { ...base, id: 'zz_cleanse_only', kind: 'self', cleanseOnly: ['curse', 'poison'] },
  {
    ...base,
    id: 'zz_buff',
    kind: 'self',
    fx: [
      { st: 'regen', dur: 5, ch: 100, to: 'self' },
      { st: 'atkUp', dur: 5, ch: 100, to: 'self' },
    ],
  },
  {
    ...base,
    id: 'zz_curse',
    kind: 'melee',
    power: 10,
    range: 400,
    fx: [
      { st: 'curse', dur: 8, ch: 100 },
      { st: 'poison', dur: 8, ch: 100 },
      { st: 'stun', dur: 2, ch: 100 },
    ],
  },
  { ...base, id: 'zz_charge_hit', kind: 'charge', power: 50 },
]

const spec = (over: Partial<IArenaFighterSpec> = {}): IArenaFighterSpec => ({
  name: 'a',
  emoji: 'a',
  element: 'flame',
  hp: 200,
  atk: 30,
  def: 10,
  spd: 12,
  eva: 0,
  acc: 8,
  res: 0,
  skills: [],
  dodge: null,
  ...over,
})

beforeAll(() => {
  for (const skill of SKILLS) ARENA_SKILL_BY_ID[skill.id] = skill
})
afterAll(() => {
  for (const skill of SKILLS) delete ARENA_SKILL_BY_ID[skill.id]
})

describe('skills without optional fields', () => {
  it.each(SKILLS.map(skill => [skill.id] as const))('%s runs with engine defaults', id => {
    for (const seed of [1, 2, 3]) {
      const teams = [[spec({ skills: [id] })], [spec({ name: 'b', skills: [id] })]]
      const first = simulateArena(teams, seed, { record: true })
      expect(simulateArena(teams, seed).checksum).toBe(first.checksum)
      expect(first.ticks).toBeGreaterThan(0)
    }
  })
})

describe('status interactions', () => {
  const fight = (a: Partial<IArenaFighterSpec>, b: Partial<IArenaFighterSpec>, seed = 1) =>
    simulateArena([[spec(a)], [spec({ name: 'b', ...b })]], seed, { record: true })
  const kinds = (result: ReturnType<typeof fight>, kind: string) =>
    result.events.filter(event => event.kind === kind)

  it('resists a stun while immune after a last stand', () => {
    const result = fight(
      { skills: ['zz_curse'], atk: 60 },
      { hp: 60, passive: { lastStand: { belowPct: 90, shield: 10, immuneSec: 30 } } }
    )
    expect(kinds(result, 'laststand').length).toBe(1)
    expect(kinds(result, 'resist').length).toBeGreaterThan(0)
  })

  it('cuts healing and shields on a cursed fighter, and cleanses it', () => {
    const result = fight({ skills: ['zz_curse'] }, { skills: ['zz_cleanse', 'zz_cleanse_only'] })
    expect(kinds(result, 'status').some(event => event.st === 'curse')).toBe(true)
    expect(kinds(result, 'cleanse').length).toBeGreaterThan(0)
    expect(kinds(result, 'shield').length).toBeGreaterThan(0)
  })

  it('runs a self regen and a buff without explicit size', () => {
    const result = fight({ skills: ['zz_buff'], hp: 400 }, { atk: 40 })
    expect(kinds(result, 'status').some(event => event.st === 'regen')).toBe(true)
    expect(kinds(result, 'regen').length).toBeGreaterThan(0)
  })

  it('never applies a status with no duration or to a fallen fighter', () => {
    const result = fight({ skills: ['zz_curse'], atk: 200 }, { hp: 1 })
    expect(result.winner).toBe(0)
  })
})

describe('tunedSkill', () => {
  const skill: IArenaSkill = { ...base, id: 'zz_t', kind: 'melee', power: 100, cd: 10 }

  it('returns the skill itself when it has no tuning', () => {
    expect(tunedSkill(skill, {})).toBe(skill)
  })

  it('scales power, cooldown and passives from the tuning', () => {
    const passive = {
      regenPct: 2,
      rebirthPct: 10,
      meleeRetort: { power: 10, st: 'blind' as const, dur: 1, ch: 90 },
    }
    const out = tunedSkill(
      { ...skill, passive, heal: 10, shield: 10 },
      { zz_t: { pow: 150, cd: 50 } }
    )
    expect(out).toMatchObject({ power: 150, cd: 5, heal: 15, shield: 15 })
    expect(out.passive).toMatchObject({ regenPct: 3, rebirthPct: 15 })
    expect(out.passive?.meleeRetort?.ch).toBe(100)
  })

  it('applies a dodge chance bonus without a cooldown change, and a cooldown cut alone', () => {
    const dodge = { cd: 8, chance: 30 }
    const chance = tunedSkill({ ...skill, dodge }, { zz_t: { chance: 10 } })
    expect(chance.dodge).toEqual({ cd: 8, chance: 40 })
    const cd = tunedSkill({ ...skill, dodge }, { zz_t: { cd: 50 } })
    expect(cd.dodge).toEqual({ cd: 4, chance: 30 })
  })

  it('caps a self buff to its uptime and grows its size instead', () => {
    const buff: IArenaSkill = {
      ...skill,
      kind: 'self',
      cd: 10,
      fx: [{ st: 'atkUp', dur: 10, ch: 100, to: 'self' }],
    }
    const out = tunedSkill(buff, { zz_t: { pow: 100, cd: 100 } } as typeof ARENA_TUNING)
    expect(out.fx![0].dur).toBeLessThan(10)
    expect(out.fx![0].mag).toBeGreaterThan(100)
  })
})
