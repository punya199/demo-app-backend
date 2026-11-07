import { ARENA_TUNING } from '../arena-data'
import { IArenaFighterSpec, StatusId } from '../arena-types'
import { isqrt } from './constants'
import { ISim } from './context'
import { atkOf, evaOf, magOf, makeFighter } from './fighter'
import { addStatus, cleanse } from './status'
import * as engine from './index'

const spec = (over: Partial<IArenaFighterSpec> = {}): IArenaFighterSpec => ({
  name: 'a',
  emoji: 'a',
  element: 'flame',
  hp: 100,
  atk: 100,
  def: 10,
  spd: 10,
  eva: 10,
  acc: 5,
  res: 0,
  skills: [],
  dodge: null,
  ...over,
})
const mk = (over: Partial<IArenaFighterSpec> = {}, team = 0, idx = 0) =>
  makeFighter(spec(over), team, idx, [0, 0], ARENA_TUNING)
const sim = (fighters: ReturnType<typeof mk>[]): ISim => ({
  record: true,
  tuning: ARENA_TUNING,
  rng: () => 0,
  fighters,
  projectiles: [],
  zones: [],
  frames: [],
  events: [],
  tick: 0,
  winner: -1,
})

describe('stat helpers', () => {
  it('reads buff size, defaulting to 100%', () => {
    const f = mk()
    expect(magOf(f, 'atkUp')).toBe(100)
    f.st.atkUp = { t: 10, mag: 150 }
    expect(magOf(f, 'atkUp')).toBe(150)
  })

  it('adds rage ATK only for a fighter that has a rage passive', () => {
    const f = mk({ passive: { rage: { sec: 1, atk: 50 } } })
    expect(atkOf(f)).toBe(100)
    f.raging = true
    expect(atkOf(f)).toBe(150)
    const plain = mk()
    plain.raging = true
    expect(atkOf(plain)).toBe(100)
  })

  it('moves evasion with its buff and debuff', () => {
    const f = mk()
    const base = evaOf(f)
    f.st.evaUp = { t: 10 }
    expect(evaOf(f)).toBeGreaterThan(base)
    delete f.st.evaUp
    f.st.evaDown = { t: 10 }
    expect(evaOf(f)).toBeLessThan(base)
  })

  it('takes the integer square root, with a floor of nothing', () => {
    expect(isqrt(0)).toBe(0)
    expect(isqrt(99)).toBe(9)
  })
})

describe('status application', () => {
  it('ignores a status on a fallen fighter or with no duration', () => {
    const [src, dead, live] = [mk(), mk({}, 1, 1), mk({}, 1, 2)]
    dead.hp = 0
    const c = sim([src, dead, live])
    addStatus(c, dead, 'stun', 2, src)
    addStatus(c, live, 'stun', 0, src)
    expect(dead.st.stun).toBeUndefined()
    expect(live.st.stun).toBeUndefined()
    expect(c.events).toEqual([])
  })

  it('resists a crowd control while immune, and logs it', () => {
    const [src, target] = [mk(), mk({}, 1, 1)]
    target.st.immune = { t: 50 }
    const c = sim([src, target])
    addStatus(c, target, 'stun', 2, src)
    expect(target.st.stun).toBeUndefined()
    expect(c.events).toEqual([{ t: 0, kind: 'resist', who: 1, st: 'stun' }])
  })

  it('stacks a buff size and a regen without an explicit value', () => {
    const f = mk()
    const c = sim([f])
    addStatus(c, f, 'regen', 2, f)
    expect(f.st.regen!.val).toBe(1)
    addStatus(c, f, 'atkUp', 2, f, { mag: 150 })
    addStatus(c, f, 'atkUp', 2, f)
    expect(f.st.atkUp!.mag).toBe(150)
  })

  it('cleanses only the listed debuffs and never a buff', () => {
    const f = mk()
    f.st.curse = { t: 5 }
    f.st.poison = { t: 5 }
    f.st.atkUp = { t: 5 }
    const c = sim([f])
    cleanse(c, f, ['curse'])
    expect(Object.keys(f.st).sort()).toEqual(['atkUp', 'poison'])
    cleanse(c, f)
    expect(Object.keys(f.st)).toEqual(['atkUp' as StatusId])
  })
})

describe('arena-engine entry point', () => {
  it('exposes the engine constants, skill helpers and simulator', () => {
    expect(engine.ACT.STUN).toBe(3)
    expect(engine.sec(2)).toBeGreaterThan(0)
    expect(engine.DEFENSE_K).toBeGreaterThan(0)
    expect(engine.MAX_DEF_CUT).toBe(7500)
    expect(engine.VAR_MIN + engine.VAR_SPAN).toBeGreaterThan(engine.VAR_MIN)
    expect(engine.STATUS_IDS).toContain('burn')
    expect(engine.STATUS_BIT.burn).toBe(1)
    expect(engine.ARENA_SKILL_BY_ID.flame_tail.id).toBe('flame_tail')
    expect(engine.getArenaSkill('flame_tail').id).toBe('flame_tail')
    expect(engine.tunedSkill).toBeInstanceOf(Function)
    expect(engine.canEquipArenaSkill).toBeInstanceOf(Function)
    expect(engine.simulateArena).toBeInstanceOf(Function)
  })
})
