// Real-time arena battle engine (pure, deterministic): integer math and one seeded RNG, so the same
// fighters and seed always give the same fight on the server and in a replay. Port of the Monster
// Arena demo engine (same RNG order, so results match the demo the balance was tuned on). Supports
// teams, skill loadouts (innate + 2 + dodge), statuses with diminishing returns on hard CC, passives.
import {
  ARENA_ENEMY_SKILLS,
  ARENA_SKILLS,
  ARENA_STATUS,
  ARENA_STATUS_NUMBERS,
  ARENA_TUNING,
} from './arena-data'
import {
  ARENA_H,
  ARENA_HP_SCALE,
  ARENA_MAX_TICKS,
  ARENA_SCALE,
  ARENA_TICK,
  ARENA_W,
  arenaEffectiveness,
  CRIT_CHANCE,
  CRIT_MULTIPLIER,
  DODGE_BASE,
  DODGE_MAX,
  DODGE_MIN_CD,
  EXECUTE_BELOW,
  MAX_BUFF_UPTIME,
  MAX_RESIST,
  SKILL_DELAY_TICKS,
} from './arena-rules'
import {
  ArenaElement,
  ArenaLine,
  IArenaEvent,
  IArenaFighterSpec,
  IArenaFrame,
  IArenaFx,
  IArenaPassive,
  IArenaResult,
  IArenaSkill,
  StatusId,
} from './arena-types'

const N = ARENA_STATUS_NUMBERS
const TICK = ARENA_TICK
const S = ARENA_SCALE
const W = ARENA_W
const H = ARENA_H
const MARGIN = 36
const PROJ_SPEED = 13 * S
const PROJ_HIT = 26 * S
const BASIC_CD = 24
const BASIC_WIND = 7
const BASIC_RANGE = 54
const DASH_TICKS = 5
const HITSTUN = 4
const MIN_GAP = 34 * S
export const DEFENSE_K = 40
export const MAX_DEF_CUT = 7500
export const VAR_MIN = 80
export const VAR_SPAN = 41
const DMG_SCALE = 1000000
const RETORT_RANGE = 90 * S
const COUNTER_RANGE = 160 * S

export const STATUS_IDS = Object.keys(ARENA_STATUS) as StatusId[]
export const STATUS_BIT = Object.fromEntries(STATUS_IDS.map((id, i) => [id, 1 << i])) as Record<
  StatusId,
  number
>
export const ARENA_SKILL_BY_ID: Record<string, IArenaSkill> = Object.fromEntries(
  [...ARENA_SKILLS, ...ARENA_ENEMY_SKILLS].map(skill => [skill.id, skill])
)

export const ACT = { MOVE: 0, WIND: 1, DODGE: 2, STUN: 3, CHARGE: 4 }
const BASIC: IArenaSkill = {
  id: 'basic',
  name: 'โจมตี',
  icon: '👊',
  el: 'neutral',
  src: '',
  slot: 'active',
  kind: 'melee',
  cd: 0,
  power: 100,
  hits: 1,
  range: BASIC_RANGE,
  wind: BASIC_WIND,
}

export const sec = (x: number) => Math.round(x * TICK)

const createRng = (seed: number) => {
  let value = seed >>> 0
  return () => {
    value = (value + 0x6d2b79f5) >>> 0
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (t ^ (t >>> 14)) >>> 0
  }
}
const isqrt = (n: number) => {
  if (n < 2) {
    return n
  }
  let x = n
  let y = Math.floor((x + 1) / 2)
  while (y < x) {
    x = y
    y = Math.floor((x + Math.floor(n / x)) / 2)
  }
  return x
}
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
const scaleTo = (dx: number, dy: number, len: number): [number, number] => {
  const d = isqrt(dx * dx + dy * dy) || 1
  return [Math.trunc((dx * len) / d), Math.trunc((dy * len) / d)]
}
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return isqrt(dx * dx + dy * dy)
}

type Tuning = typeof ARENA_TUNING

const scalePassive = (p: IArenaPassive, pow: number): IArenaPassive => {
  const k = (v: number) => Math.round(((v * pow) / 100) * 10) / 10
  const out: IArenaPassive = { ...p }
  if (p.rebirthPct) out.rebirthPct = k(p.rebirthPct)
  if (p.regenPct) out.regenPct = k(p.regenPct)
  if (p.damageCut) out.damageCut = k(p.damageCut)
  if (p.tenacity) out.tenacity = k(p.tenacity)
  if (p.basicLifesteal) out.basicLifesteal = k(p.basicLifesteal)
  if (p.eva) out.eva = k(p.eva)
  if (p.dodgeCdCut) out.dodgeCdCut = k(p.dodgeCdCut)
  if (p.meleeRetort) {
    out.meleeRetort = {
      ...p.meleeRetort,
      power: k(p.meleeRetort.power),
      ch: Math.min(100, k(p.meleeRetort.ch)),
    }
  }
  if (p.onBasic) out.onBasic = { ...p.onBasic, ch: Math.min(100, k(p.onBasic.ch)) }
  if (p.lastStand) out.lastStand = { ...p.lastStand, shield: k(p.lastStand.shield) }
  if (p.enrage) out.enrage = { ...p.enrage, atk: k(p.enrage.atk) }
  if (p.afterDodge) out.afterDodge = { ...p.afterDodge, bonus: k(p.afterDodge.bonus) }
  return out
}

// A skill with the balance tuning applied (cooldown and strength multipliers in percent).
export const tunedSkill = (skill: IArenaSkill, tuning: Tuning = ARENA_TUNING): IArenaSkill => {
  const t = tuning[skill.id]
  if (!t) {
    return skill
  }
  const pow = t.pow ?? 100
  const out: IArenaSkill = { ...skill }
  if (t.cd) out.cd = Math.round(skill.cd * t.cd) / 100
  if (skill.power) out.power = Math.round((skill.power * pow) / 100)
  if (skill.heal) out.heal = Math.round((skill.heal * pow) / 100)
  if (skill.shield) out.shield = Math.round((skill.shield * pow) / 100)
  // Strength also stretches status durations (and regen per second).
  const dur = t.dur ?? pow
  if (skill.fx && dur !== 100) {
    out.fx = skill.fx.map(e => ({
      ...e,
      dur: Math.round(e.dur * dur) / 100,
      ...(e.val && { val: Math.round(e.val * dur) / 100 }),
    }))
  }
  // A self buff lasts at most MAX_BUFF_UPTIME of the cooldown; strength the cap cuts off goes into
  // the buff's size instead (up to x2.5), so strong buffs get bigger, not permanent.
  if (out.fx && out.cd) {
    const cap = Math.round(out.cd * MAX_BUFF_UPTIME) / 100
    out.fx = out.fx.map(e => {
      if (e.to !== 'self' || e.dur <= cap) {
        return e
      }
      return { ...e, dur: cap, mag: Math.min(250, Math.round((e.dur * 100) / cap)) }
    })
  }
  if (skill.passive && pow !== 100) out.passive = scalePassive(skill.passive, pow)
  if (skill.dodge && (t.cd || t.chance)) {
    out.dodge = {
      ...skill.dodge,
      cd: Math.round(skill.dodge.cd * (t.cd || 100)) / 100,
      chance: skill.dodge.chance + (t.chance || 0),
    }
  }
  return out
}

export const getArenaSkill = (id: string) => tunedSkill(ARENA_SKILL_BY_ID[id])

// Whether a monster may put a skill in a slot: its own element (a fused form: either parent's) or
// neutral; never its innate twice; at most one passive in the whole loadout, the innate included.
export const canEquipArenaSkill = (
  monster: { elements: ArenaLine[]; innate: string | null },
  skill: IArenaSkill,
  loadout: string[] = []
) => {
  if (skill.src === 'enemy') return false
  if (skill.slot === 'dodge') return true
  if (skill.el !== 'neutral' && !monster.elements.includes(skill.el)) return false
  if (skill.id === monster.innate) return false
  if (skill.slot === 'passive') {
    const ids = [monster.innate, ...loadout].filter((id): id is string => !!id)
    if (ids.some(id => ARENA_SKILL_BY_ID[id]?.slot === 'passive')) return false
  }
  return true
}

interface IStatusState {
  t: number
  mag?: number
  stacks?: number
  per?: number
  next?: number
  src?: number
  val?: number
}

interface IEvade {
  from: number
  until: number
  parry: boolean
  dashAt: number | 'proj' | 'charge' | null
  fromX: number
  fromY: number
  active: boolean
  used: boolean
}

interface IFighter {
  team: number
  idx: number
  name: string
  emoji: string
  el: ArenaLine
  atk: number
  def: number
  spd: number
  crit: number
  boss: boolean
  eva: number
  acc: number
  res: number
  x: number
  y: number
  hp: number
  maxHp: number
  shield: number
  shieldT: number
  skills: IArenaSkill[]
  allSlots: IArenaSkill[]
  passive: IArenaPassive
  dodge: IArenaSkill | null
  baseStep: number
  basicCd: number
  cds: number[]
  dodgeCd: number
  gcd: number
  act: number
  actT: number
  kind: number
  vx: number
  vy: number
  chargeHit: boolean
  inv: boolean
  vanish: number
  evade: IEvade | null
  orbit: number
  face: number
  st: Partial<Record<StatusId, IStatusState>>
  ccCount: number
  ccUntil: number
  critNext: boolean
  critBonus: number
  raging: boolean
  usesElements: boolean
  seized: boolean
  regenAcc: number
  flinchReady: number
  rebirthUsed: boolean
  lastStandUsed: boolean
  targetIdx: number
  dealt: number
  taken: number
  healed: number
  dodges: number
  casts: number
}

interface IProjectile {
  owner: number
  team: number
  x: number
  y: number
  vx: number
  vy: number
  life: number
  aim: number
  skill: IArenaSkill
}

interface IZone {
  owner: number
  team: number
  x: number
  y: number
  r: number
  t: number
  total: number
  skill: IArenaSkill
}

const makeFighter = (
  spec: IArenaFighterSpec,
  team: number,
  idx: number,
  pos: [number, number],
  tuning: Tuning
): IFighter => {
  const slots = spec.skills.filter(Boolean).map(id => tunedSkill(ARENA_SKILL_BY_ID[id], tuning))
  const actives = slots.filter(s => s.slot === 'active')
  const skillPassives = slots.filter(s => s.slot === 'passive').map(s => s.passive)
  const passive: IArenaPassive = Object.assign({}, spec.passive ?? {}, ...skillPassives)
  // The tree's healing adds to a passive skill's instead of being replaced by it.
  for (const key of ['regenPct', 'basicLifesteal', 'damageCut'] as const) {
    if (spec.passive?.[key]) {
      passive[key] = skillPassives.reduce((sum, p) => sum + (p?.[key] || 0), spec.passive[key])
    }
  }
  const dodge = spec.dodge ? tunedSkill(ARENA_SKILL_BY_ID[spec.dodge], tuning) : null
  const maxHp = Math.round(spec.hp * ARENA_HP_SCALE)
  return {
    team,
    idx,
    name: spec.name,
    emoji: spec.emoji,
    el: spec.element,
    atk: spec.atk,
    def: spec.def,
    spd: spec.spd,
    crit: spec.crit || 0,
    boss: !!spec.boss,
    eva: spec.eva + (passive.eva || 0),
    acc: spec.acc,
    res: spec.res,
    x: pos[0] * S,
    y: pos[1] * S,
    hp: maxHp,
    maxHp,
    // A start shield has no timer: it stays until it is broken.
    shield: Math.trunc((maxHp * (passive.startShield || 0)) / 100) + (passive.flatShield || 0),
    shieldT: 0,
    skills: actives,
    allSlots: slots,
    passive,
    dodge,
    baseStep: Math.trunc(((70 + spec.spd * 5) * S) / TICK),
    basicCd: passive.firstStrike ? 0 : 10 + idx * 3,
    cds: actives.map((_, i) => (passive.firstStrike ? 0 : sec(1) + i * sec(1.25))),
    dodgeCd: 0,
    gcd: 0,
    act: ACT.MOVE,
    actT: 0,
    kind: -1,
    vx: 0,
    vy: 0,
    chargeHit: false,
    inv: false,
    vanish: 0,
    evade: null,
    orbit: team === 0 ? 1 : -1,
    face: team === 0 ? 1 : -1,
    st: {},
    ccCount: 0,
    ccUntil: -1,
    critNext: false,
    critBonus: 0,
    raging: false,
    usesElements: !!spec.usesElements,
    seized: false,
    regenAcc: 0,
    flinchReady: 0,
    rebirthUsed: false,
    lastStandUsed: false,
    targetIdx: -1,
    dealt: 0,
    taken: 0,
    healed: 0,
    dodges: 0,
    casts: 0,
  }
}

const has = (f: IFighter, st: StatusId) => !!f.st[st]
const magOf = (f: IFighter, st: StatusId) => f.st[st]?.mag ?? 100

const atkOf = (f: IFighter) => {
  let pct = 100
  if (has(f, 'atkUp')) pct += Math.trunc((N.atkUp * magOf(f, 'atkUp')) / 100)
  if (has(f, 'atkDown')) pct -= N.atkDown
  if (f.raging) pct += f.passive.rage?.atk ?? 0
  if (f.passive.enrage && f.hp * 100 < f.maxHp * f.passive.enrage.belowPct) {
    pct += f.passive.enrage.atk
  }
  return Math.trunc((f.atk * pct) / 100)
}
const defOf = (f: IFighter) => {
  let pct = 100
  if (has(f, 'defUp')) pct += Math.trunc((N.defUp * magOf(f, 'defUp')) / 100)
  if (has(f, 'defDown')) pct -= N.defDown
  return Math.trunc((f.def * pct) / 100)
}
const resistOf = (f: IFighter, cc: boolean) =>
  Math.min(MAX_RESIST, f.res + (cc ? f.passive.tenacity || 0 : 0))
const stepOf = (f: IFighter) => {
  if (has(f, 'root')) return 0
  let pct = 100 - (f.passive.moveCut || 0)
  if (has(f, 'haste')) pct += N.hasteMove
  if (has(f, 'slow')) pct -= N.slowMove
  return Math.trunc((f.baseStep * pct) / 100)
}
const attackTimePct = (f: IFighter) => {
  let pct = 100 - (f.passive.attackSpeed || 0)
  if (has(f, 'haste')) pct -= N.hasteAttack
  if (has(f, 'slow')) pct += N.slowAttack
  return pct
}
const evaOf = (f: IFighter) =>
  f.eva +
  (has(f, 'evaUp') ? Math.trunc((N.evaUp * magOf(f, 'evaUp')) / 100) : 0) -
  (has(f, 'evaDown') ? N.evaDown : 0)

export interface IArenaOptions {
  record?: boolean
  tuning?: Tuning
}

export const simulateArena = (
  teams: IArenaFighterSpec[][],
  seed: number,
  options: IArenaOptions = {}
): IArenaResult => {
  const record = !!options.record
  const tuning = options.tuning ?? ARENA_TUNING
  const rng = createRng(seed)
  const roll = (n: number) => rng() % n
  const lands = (f: IFighter, ch: number, st: StatusId) =>
    ch >= 100 || roll(100) < Math.trunc((ch * (100 - resistOf(f, !!ARENA_STATUS[st].cc))) / 100)
  const fighters: IFighter[] = []
  teams.forEach((team, t) => {
    team.forEach((spec, i) => {
      const n = team.length
      const x = t === 0 ? 150 : W - 150
      const y = H / 2 + (n === 1 ? (t === 0 ? 40 : -40) : Math.round((i - (n - 1) / 2) * 110))
      fighters.push(makeFighter(spec, t, fighters.length, [x, y], tuning))
    })
  })
  const projectiles: IProjectile[] = []
  const zones: IZone[] = []
  const frames: IArenaFrame[] = []
  const events: IArenaEvent[] = []
  let tick = 0
  let winner = -1

  const log = (e: Omit<IArenaEvent, 't'>) => {
    if (record) events.push({ t: tick, ...e })
  }
  const alive = (f: IFighter) => f.hp > 0
  const enemiesOf = (f: IFighter) => fighters.filter(o => o.team !== f.team && alive(o))
  const pickTarget = (f: IFighter) => {
    let best: IFighter | null = null
    let bestD = 0
    for (const o of fighters) {
      if (o.team === f.team || !alive(o) || o.vanish > 0) continue
      const d = dist(f, o)
      if (!best || d < bestD) {
        best = o
        bestD = d
      }
    }
    return best
  }

  // ----- statuses -----
  const addStatus = (
    f: IFighter,
    st: StatusId,
    durSec: number,
    src: IFighter,
    extra: Partial<IArenaFx> = {}
  ) => {
    if (!alive(f) || durSec <= 0) return
    const info = ARENA_STATUS[st]
    let dur = sec(durSec)
    if (info.kind === 'debuff' && src.team !== f.team) {
      dur = Math.trunc((dur * (100 - resistOf(f, !!info.cc))) / 100)
    }
    if (info.cc) {
      if (has(f, 'immune')) {
        log({ kind: 'resist', who: f.idx, st })
        return
      }
      f.ccCount = tick < f.ccUntil ? f.ccCount + 1 : 0
      const pct = N.ccSteps[Math.min(f.ccCount, N.ccSteps.length - 1)]
      dur = Math.trunc((dur * pct) / 100)
      if (dur <= 0) {
        log({ kind: 'resist', who: f.idx, st })
        return
      }
      f.ccUntil = tick + dur + sec(N.ccWindowSec)
    }
    const cur = f.st[st]
    if (st === 'poison') {
      const per = Math.max(1, Math.trunc((src.atk * N.poisonAtkPctPerSec) / 100))
      f.st.poison = {
        t: Math.max(cur ? cur.t : 0, dur),
        stacks: Math.min(N.poisonMaxStacks, (cur?.stacks ?? 0) + 1),
        per: Math.max(cur?.per ?? 0, per),
        next: cur?.next ?? tick + TICK,
        src: src.idx,
      }
    } else if (st === 'burn') {
      const per = Math.max(1, Math.trunc((atkOf(src) * N.burnAtkPctPerSec) / 100))
      f.st.burn = {
        t: Math.max(cur ? cur.t : 0, dur),
        per: Math.max(cur?.per ?? 0, per),
        next: cur?.next ?? tick + TICK,
        src: src.idx,
      }
    } else if (st === 'regen') {
      f.st.regen = {
        t: Math.max(cur ? cur.t : 0, dur),
        val: extra.val || 1,
        next: cur?.next ?? tick + TICK,
      }
    } else {
      f.st[st] = {
        t: Math.max(cur ? cur.t : 0, dur),
        mag: Math.max(cur && cur.t > 0 ? cur.mag || 100 : 0, extra.mag || 100),
      }
    }
    if (st === 'stun') {
      // A stun interrupts a wind-up or a charge (the skill's cooldown is already spent).
      f.act = ACT.STUN
      f.actT = dur
      f.vx = 0
      f.vy = 0
      f.evade = null
      f.inv = false
    }
    log({ kind: 'status', who: f.idx, st, dur })
  }
  const cleanse = (f: IFighter, only?: StatusId[]) => {
    let n = 0
    for (const st of Object.keys(f.st) as StatusId[]) {
      if (ARENA_STATUS[st].kind !== 'debuff') continue
      if (only && !only.includes(st)) continue
      delete f.st[st]
      n++
    }
    if (f.act === ACT.STUN && !only) f.actT = 0
    if (n) log({ kind: 'cleanse', who: f.idx })
  }
  const heal = (f: IFighter, amount: number) => {
    if (has(f, 'curse')) amount = Math.trunc((amount * (100 - N.curse)) / 100)
    const got = Math.min(f.maxHp - f.hp, Math.max(0, amount))
    f.hp += got
    f.healed += got
    return got
  }
  const giveShield = (f: IFighter, pct: number, durSec: number) => {
    let amount = Math.trunc((f.maxHp * pct) / 100)
    if (has(f, 'curse')) amount = Math.trunc((amount * (100 - N.curse)) / 100)
    if (amount > f.shield) f.shield = amount
    f.shieldT = Math.max(f.shieldT, sec(durSec))
    log({ kind: 'shield', who: f.idx, amount: f.shield })
  }

  const checkLowHp = (f: IFighter) => {
    const p = f.passive
    if (f.hp === 0 && p.rebirthPct && !f.rebirthUsed) {
      f.rebirthUsed = true
      f.hp = Math.max(1, Math.trunc((f.maxHp * p.rebirthPct) / 100))
      cleanse(f)
      log({ kind: 'rebirth', who: f.idx, amount: f.hp })
      return
    }
    if (
      p.lastStand &&
      !f.lastStandUsed &&
      f.hp > 0 &&
      f.hp * 100 < f.maxHp * p.lastStand.belowPct
    ) {
      f.lastStandUsed = true
      cleanse(f)
      giveShield(f, p.lastStand.shield, 6)
      f.st.immune = { t: sec(p.lastStand.immuneSec) }
      log({ kind: 'laststand', who: f.idx })
    }
    if (f.hp === 0) {
      f.act = ACT.MOVE
      log({ kind: 'ko', who: f.idx })
    }
  }

  // ----- dodging -----
  const canDash = (f: IFighter) =>
    alive(f) &&
    !has(f, 'stun') &&
    !f.seized &&
    (f.act === ACT.MOVE || f.act === ACT.STUN || (f.act === ACT.WIND && f.kind === -1))
  const startDash = (f: IFighter, fromX: number, fromY: number, away: boolean) => {
    const dx = f.x - fromX
    const dy = f.y - fromY
    let px: number
    let py: number
    const len = Math.max(stepOf(f), f.baseStep / 2) * 3
    if (away || (dx === 0 && dy === 0)) {
      ;[px, py] = scaleTo(dx || 1, dy, len)
    } else {
      const sign = roll(2) === 0 ? 1 : -1
      ;[px, py] = scaleTo(-dy * sign, dx * sign, len)
    }
    if (f.act === ACT.WIND) f.kind = -1
    f.act = ACT.DODGE
    f.actT = DASH_TICKS
    f.vx = Math.trunc(px)
    f.vy = Math.trunc(py)
    f.inv = true
  }
  const dodgeRoll = (d: IFighter, a: IFighter) => {
    if (!d.dodge?.dodge || d.dodgeCd > 0 || !canDash(d)) return false
    // Evasion against the attacker's accuracy; speed plays no part.
    const chance = clamp(DODGE_BASE + evaOf(d) - a.acc + d.dodge.dodge.chance, 10, DODGE_MAX)
    d.dodgeCd = sec(Math.max(DODGE_MIN_CD, d.dodge.dodge.cd - (d.passive.dodgeCdCut || 0)))
    return roll(100) < chance
  }
  // landTick: when the blow lands; 'proj' = when the projectile gets close; 'charge' = when the
  // charger gets close. A parry needs no dash; a dash must still be possible at that moment.
  const planDodge = (
    d: IFighter,
    a: IFighter,
    landTick: number | 'proj' | 'charge',
    fromX: number,
    fromY: number
  ) => {
    if (!dodgeRoll(d, a)) return
    const parry = !!d.dodge?.dodge?.parry
    const timed = typeof landTick === 'number'
    d.evade = {
      from: a.idx,
      until: timed ? landTick + 2 : tick + 70,
      parry,
      dashAt: parry ? null : timed ? landTick - 2 : landTick,
      fromX,
      fromY,
      active: parry,
      used: false,
    }
  }

  const onDodged = (d: IFighter, a: IFighter) => {
    d.dodges++
    const od = d.dodge?.dodge?.onDodge
    if (od) {
      if (od.haste) addStatus(d, 'haste', od.haste, d)
      if (od.cleanse) cleanse(d)
      if (od.blindAttacker) addStatus(a, 'blind', od.blindAttacker, d)
      if (od.vanish) d.vanish = Math.max(d.vanish, sec(od.vanish))
      if (od.critNext) d.critNext = true
      if (od.counter && alive(a) && dist(a, d) <= COUNTER_RANGE) {
        hit(
          d,
          a,
          od.counter,
          { ...BASIC, name: d.dodge?.name ?? '', el: d.el, fx: [] },
          { isRetort: true }
        )
      }
    }
    if (d.passive.afterDodge) {
      d.critNext = true
      d.critBonus = Math.max(d.critBonus, d.passive.afterDodge.bonus || 0)
    }
  }

  const dashNow = (f: IFighter, fromX: number, fromY: number, away: boolean, window: number) => {
    const ev = f.evade
    if (!ev || !canDash(f)) {
      f.evade = null
      return
    }
    startDash(f, fromX, fromY, away)
    ev.active = true
    ev.dashAt = null
    if (window) ev.until = tick + window
    // A dash taken against a known attack avoids it: it counts (and triggers dodge effects) now.
    ev.used = true
    log({ kind: 'dodge', who: f.idx, by: ev.from, x: f.x, y: f.y })
    onDodged(f, fighters[ev.from])
  }

  // ----- damage -----
  // One hit. `power` in % of ATK; `skill` null = a basic attack; `melee` enables retorts.
  function hit(
    a: IFighter,
    d: IFighter,
    power: number,
    skill: IArenaSkill | null,
    opt: { melee?: boolean; isRetort?: boolean } = {}
  ) {
    if (!alive(a) || !alive(d)) return
    const name = skill ? skill.name : BASIC.name
    let parried = false
    const ev = d.evade
    if (d.vanish > 0 || (ev && ev.active && ev.from === a.idx && tick <= ev.until)) {
      if (ev && ev.parry && d.vanish === 0) {
        parried = true
      } else {
        log({ kind: 'dodge', who: d.idx, by: a.idx, x: d.x, y: d.y })
        if (ev && !ev.used) {
          ev.used = true
          onDodged(d, a)
        }
        return
      }
    }
    if (has(a, 'blind') && roll(100) < N.blindMiss) {
      log({ kind: 'miss', who: a.idx, target: d.idx })
      return
    }
    const attackEl: ArenaElement = skill && skill.el && skill.el !== 'neutral' ? skill.el : a.el
    // Adventure bosses ignore elements both ways (like Boss Raid): a boss fight is a close damage
    // race, where even a small element edge decided it for whole elements.
    const ignoresElements = (f: IFighter) => f.boss && !f.usesElements
    const elem = ignoresElements(a) || ignoresElements(d) ? 100 : arenaEffectiveness(attackEl, d.el)
    const atk = atkOf(a)
    const def = defOf(d)
    const raw = Math.floor((atk * power * elem) / 100)
    const cut = Math.min(MAX_DEF_CUT, Math.floor((def * 10000) / (def + DEFENSE_K)))
    const reduced = Math.floor((raw * (10000 - cut)) / 10000)
    const variance = VAR_MIN + roll(VAR_SPAN)
    const critRoll = roll(100)
    const crit =
      !a.passive.noCrit &&
      (a.critNext ||
        critRoll <
          CRIT_CHANCE +
            a.crit +
            (has(a, 'focus') ? Math.trunc((N.focusCrit * magOf(a, 'focus')) / 100) : 0))
    let mul = crit ? CRIT_MULTIPLIER + (a.passive.critDamage || 0) : 100
    if (a.critNext) {
      mul = Math.trunc((mul * (100 + a.critBonus)) / 100)
      a.critNext = false
      a.critBonus = 0
    }
    const vs = a.passive.bonusVsStatus
    if (vs && has(d, vs.st)) mul = Math.trunc((mul * (100 + vs.pct)) / 100)
    const ex = a.passive.executeVs
    if (ex && d.hp * 100 < d.maxHp * ex.belowPct) mul = Math.trunc((mul * (100 + ex.pct)) / 100)
    if (skill?.execute && d.hp * 100 < d.maxHp * EXECUTE_BELOW) {
      mul = Math.trunc((mul * (100 + skill.execute)) / 100)
    }
    let dmg = Math.max(1, Math.floor((reduced * variance * mul) / DMG_SCALE))
    if (d.passive.damageCut) {
      dmg = Math.max(1, Math.round((dmg * (100 - d.passive.damageCut)) / 100))
    }
    if (parried && ev) {
      dmg = Math.max(1, Math.trunc((dmg * (100 - (d.dodge?.dodge?.parry ?? 0))) / 100))
      if (!ev.used) {
        ev.used = true
        d.dodges++
      }
    }
    let absorbed = 0
    if (d.shield > 0) {
      absorbed = Math.min(d.shield, dmg)
      d.shield -= absorbed
    }
    const lost = Math.min(d.hp, dmg - absorbed)
    d.hp -= lost
    a.dealt += lost
    d.taken += lost
    let healed = 0
    const ls = skill ? skill.lifesteal || 0 : a.passive.basicLifesteal || 0
    if (ls && lost > 0) healed = heal(a, Math.max(1, Math.trunc((lost * ls) / 100)))
    if (d.passive.thorns && lost > 0 && !opt.isRetort) {
      const back = Math.min(a.hp, Math.max(1, Math.trunc((lost * d.passive.thorns) / 100)))
      a.hp -= back
      a.taken += back
      d.dealt += back
      log({ kind: 'thorns', who: a.idx, by: d.idx, dmg: back, x: a.x, y: a.y })
    }
    // At most one flinch per half second, so a volley of small hits can't lock a target in place.
    if (d.act === ACT.MOVE && d.hp > 0 && tick >= d.flinchReady) {
      d.flinchReady = tick + 10
      const [kx, ky] = scaleTo(d.x - a.x, d.y - a.y, 8 * S)
      d.act = ACT.STUN
      d.actT = HITSTUN
      d.vx = Math.trunc(kx / HITSTUN)
      d.vy = Math.trunc(ky / HITSTUN)
    }
    log({
      kind: 'hit',
      who: a.idx,
      target: d.idx,
      dmg,
      absorbed,
      crit,
      elem,
      skill: name,
      x: d.x,
      y: d.y,
      parried,
      healed,
    })
    if (d.hp > 0 && skill?.fx) {
      for (const e of skill.fx) {
        if (e.to === 'self') continue
        if (lands(d, e.ch, e.st)) addStatus(d, e.st, e.dur, a, e)
      }
    }
    if (d.hp > 0 && !skill && a.passive.onBasic) {
      const ob = a.passive.onBasic
      if (lands(d, ob.ch, ob.st)) addStatus(d, ob.st, ob.dur, a)
    }
    if (!skill && a.passive.onBasicExtra) {
      for (const extra of a.passive.onBasicExtra) {
        if (alive(d) && lands(d, extra.ch, extra.st)) addStatus(d, extra.st, extra.dur, a)
      }
    }
    if (
      opt.melee &&
      d.passive.meleeRetort &&
      alive(a) &&
      dist(a, d) <= RETORT_RANGE &&
      !opt.isRetort
    ) {
      const r = d.passive.meleeRetort
      if (r.power > 0) {
        hit(d, a, r.power, { ...BASIC, name: 'สวนกลับ', el: d.el, fx: [] }, { isRetort: true })
      }
      if (alive(a) && lands(a, r.ch, r.st)) addStatus(a, r.st, r.dur, d)
    }
    checkLowHp(d)
    checkLowHp(a)
  }

  // ----- attacks -----
  const fire = (me: IFighter, target: IFighter, skill: IArenaSkill) => {
    const n = skill.hits || 1
    const dx = target.x - me.x
    const dy = target.y - me.y
    const span = n === 1 ? 0 : 56
    planDodge(target, me, 'proj', me.x, me.y)
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : Math.trunc(-span / 2 + (span * i) / (n - 1))
      const [px, py] = scaleTo(-dy, dx, Math.trunc((isqrt(dx * dx + dy * dy) * off) / 100) || 0)
      const [vx, vy] = scaleTo(dx + px, dy + py, PROJ_SPEED)
      projectiles.push({
        owner: me.idx,
        team: me.team,
        x: me.x,
        y: me.y,
        vx,
        vy,
        life: 50,
        aim: target.idx,
        skill,
      })
    }
  }

  const release = (me: IFighter) => {
    const sk = me.kind < 0 ? BASIC : me.skills[me.kind]
    const target = me.targetIdx >= 0 ? fighters[me.targetIdx] : null
    me.act = ACT.MOVE
    if (sk !== BASIC) {
      if (sk.fx) for (const e of sk.fx) if (e.to === 'self') addStatus(me, e.st, e.dur, me, e)
      if (sk.heal) {
        const got = heal(me, Math.trunc((me.maxHp * sk.heal) / 100))
        log({ kind: 'heal', who: me.idx, amount: got, x: me.x, y: me.y })
      }
      if (sk.shield) giveShield(me, sk.shield, sk.shieldSec || 4)
      if (sk.cleanse) cleanse(me)
      if (sk.cleanseOnly) cleanse(me, sk.cleanseOnly)
    }
    if (sk.kind === 'self') return
    if (!target || !alive(target)) return
    const d = dist(me, target)
    const power = sk.power ?? 0
    if (sk.kind === 'melee' || sk.kind === 'multi') {
      if (d <= ((sk.range || BASIC_RANGE) + 16) * S) {
        for (let i = 0; i < (sk.hits || 1); i++) {
          hit(me, target, power, sk === BASIC ? null : sk, { melee: true })
        }
        if (sk === BASIC && me.passive.doubleStrike && roll(100) < me.passive.doubleStrike) {
          hit(me, target, power, null, { melee: true })
        }
      } else {
        log({ kind: 'miss', who: me.idx, target: target.idx })
      }
    } else if (sk.kind === 'shot' || sk.kind === 'spread') {
      fire(me, target, sk)
    } else if (sk.kind === 'burst') {
      const radius = sk.radius ?? 0
      log({ kind: 'burst', who: me.idx, x: me.x, y: me.y, r: radius, el: sk.el })
      for (const o of enemiesOf(me)) if (dist(me, o) <= radius * S) hit(me, o, power, sk)
    } else if (sk.kind === 'beam') {
      const [ux, uy] = scaleTo(target.x - me.x, target.y - me.y, 1000)
      const len = (sk.length ?? 0) * S
      const width = sk.width ?? 0
      log({
        kind: 'beam',
        who: me.idx,
        x: me.x,
        y: me.y,
        x2: me.x + Math.trunc((ux * len) / 1000),
        y2: me.y + Math.trunc((uy * len) / 1000),
        w: width,
        el: sk.el,
      })
      for (const o of enemiesOf(me)) {
        const rx = o.x - me.x
        const ry = o.y - me.y
        const along = Math.trunc((rx * ux + ry * uy) / 1000)
        const across = Math.abs(Math.trunc((rx * uy - ry * ux) / 1000))
        if (along >= 0 && along <= len && across <= width * S) hit(me, o, power, sk)
      }
    } else if (sk.kind === 'zone') {
      const radius = sk.radius ?? 0
      const delay = sk.delay ?? 0
      zones.push({
        owner: me.idx,
        team: me.team,
        x: target.x,
        y: target.y,
        r: radius,
        t: delay,
        total: delay,
        skill: sk,
      })
      for (const o of enemiesOf(me)) {
        if (dist(o, target) <= (radius + 30) * S) {
          planDodge(o, me, tick + delay, target.x, target.y)
        }
      }
      log({ kind: 'zone', who: me.idx, x: target.x, y: target.y, r: radius, el: sk.el })
    } else if (sk.kind === 'charge') {
      const [vx, vy] = scaleTo(
        target.x - me.x,
        target.y - me.y,
        Math.trunc(Math.max(stepOf(me), me.baseStep / 2) * 3.5)
      )
      me.act = ACT.CHARGE
      me.actT = 12
      me.vx = vx
      me.vy = vy
      me.chargeHit = false
      planDodge(target, me, 'charge', me.x, me.y)
      if (target.evade && target.evade.from === me.idx) target.evade.until = tick + 14
    }
  }

  // Which ready skill fits now (scored; ties keep slot order).
  const pickSkill = (me: IFighter, target: IFighter, d: number) => {
    if (me.gcd > 0 || has(me, 'silence')) return -1
    let best = -1
    let bestScore = 0
    const dpx = d / S
    const hpPct = Math.trunc((me.hp * 100) / me.maxHp)
    const debuffed = (Object.keys(me.st) as StatusId[]).some(
      st => ARENA_STATUS[st].kind === 'debuff'
    )
    const targetCC =
      has(target, 'stun') || has(target, 'root') || has(target, 'silence') || has(target, 'immune')
    for (let i = 0; i < me.skills.length; i++) {
      if (me.cds[i] > 0) continue
      const sk = me.skills[i]
      let score = 0
      if (sk.kind === 'self') {
        if (sk.heal) score = hpPct < 55 ? 90 : hpPct < 75 ? 30 : 0
        if (sk.cleanse && debuffed) score = Math.max(score, 75)
        if (sk.cleanseOnly && sk.cleanseOnly.some(st => has(me, st))) score = Math.max(score, 75)
        if (sk.shield && me.shield === 0 && dpx <= 220) score = Math.max(score, 55)
        const buffs = (sk.fx || []).filter(e => e.to === 'self')
        if (buffs.length && dpx <= 240 && buffs.some(e => !has(me, e.st))) {
          score = Math.max(score, 50)
        }
      } else {
        const fits =
          ((sk.kind === 'melee' || sk.kind === 'multi') && dpx <= (sk.range ?? 0)) ||
          (sk.kind === 'burst' && dpx <= (sk.radius ?? 0) * 0.8) ||
          (sk.kind === 'charge' && dpx >= 80 && dpx <= 260) ||
          ((sk.kind === 'shot' || sk.kind === 'spread') && dpx >= 50 && dpx <= 320) ||
          (sk.kind === 'beam' && dpx <= (sk.length ?? 0) * 0.85) ||
          (sk.kind === 'zone' && dpx <= 320)
        if (!fits) continue
        score = 60 + Math.trunc(((sk.power || 0) * (sk.hits || 1)) / 25)
        const cc = (sk.fx || []).some(e => e.to !== 'self' && ARENA_STATUS[e.st].cc)
        if (cc) score += targetCC ? -25 : 15
        if (sk.execute && target.hp * 100 < target.maxHp * EXECUTE_BELOW) score += 40
        if (sk.kind === 'burst' || sk.kind === 'zone') {
          const r = (sk.radius || 0) * S
          const center = sk.kind === 'burst' ? me : target
          const n = enemiesOf(me).filter(o => dist(center, o) <= r).length
          score += (n - 1) * 20
        }
      }
      if (score > bestScore) {
        bestScore = score
        best = i
      }
    }
    return best
  }

  // Static: each time it starts an action there is a chance to seize up instead.
  const staticSeize = (me: IFighter) => {
    if (has(me, 'static') && roll(100) < N.staticChance) {
      me.act = ACT.STUN
      me.actT = sec(N.staticStunSec)
      me.seized = true
      log({ kind: 'seize', who: me.idx })
      return true
    }
    return false
  }

  const recordFrame = () => {
    if (!record) return
    frames.push({
      f: fighters.map(me => {
        let bits = 0
        for (const st of Object.keys(me.st) as StatusId[]) bits |= STATUS_BIT[st]
        return [
          me.x,
          me.y,
          me.hp,
          me.act,
          me.kind,
          me.actT,
          me.inv || me.vanish > 0 ? 1 : 0,
          me.face,
          me.shield,
          bits,
          me.dodgeCd,
          ...me.cds.map(c => Math.max(c, me.gcd)),
        ]
      }),
      p: projectiles
        .filter(p => p.life > 0)
        .map(p => [p.x, p.y, p.team, p.skill.el || fighters[p.owner].el]),
      z: zones
        .filter(z => z.t > 0)
        .map(z => [z.x, z.y, z.r, z.t, z.total, z.skill.el || fighters[z.owner].el]),
    })
  }

  log({ kind: 'start' })
  recordFrame()

  for (tick = 1; tick <= ARENA_MAX_TICKS; tick++) {
    // Seeded shuffle of who acts first this tick.
    const order = fighters.slice()
    for (let i = order.length - 1; i > 0; i--) {
      const j = roll(i + 1)
      const tmp = order[i]
      order[i] = order[j]
      order[j] = tmp
    }
    for (const me of order) {
      if (!alive(me)) continue
      if (me.basicCd > 0) me.basicCd--
      for (let i = 0; i < me.cds.length; i++) if (me.cds[i] > 0) me.cds[i]--
      if (me.dodgeCd > 0) me.dodgeCd--
      if (me.gcd > 0) me.gcd--
      if (me.vanish > 0) me.vanish--
      if (me.shieldT > 0 && --me.shieldT === 0) me.shield = 0
      for (const st of Object.keys(me.st) as StatusId[]) {
        const s = me.st[st]
        if (!s) continue
        if ((st === 'burn' || st === 'poison') && tick >= (s.next ?? 0)) {
          s.next = tick + TICK
          const src = fighters[s.src ?? 0]
          const dmg = st === 'poison' ? (s.per ?? 0) * (s.stacks ?? 1) : (s.per ?? 0)
          const lost = Math.min(me.hp, dmg)
          me.hp -= lost
          me.taken += lost
          src.dealt += lost
          log({ kind: 'dot', who: me.idx, st, dmg: lost, x: me.x, y: me.y })
          checkLowHp(me)
          if (!alive(me)) break
        }
        if (st === 'regen' && tick >= (s.next ?? 0)) {
          s.next = tick + TICK
          const got = heal(me, Math.trunc((me.maxHp * (s.val ?? 0)) / 100))
          if (got) log({ kind: 'regen', who: me.idx, amount: got, x: me.x, y: me.y })
        }
        if (me.st[st] === s && --s.t <= 0) delete me.st[st]
      }
      if (!alive(me)) continue
      if (me.passive.rage && !me.raging && tick >= sec(me.passive.rage.sec)) {
        me.raging = true
        log({ kind: 'rage', who: me.idx, x: me.x, y: me.y })
      }
      const refresh = me.passive.shieldEvery
      if (refresh && tick % sec(refresh.sec) === 0) giveShield(me, refresh.pct, refresh.sec)
      if (me.passive.regenPct && tick % TICK === me.idx % TICK) {
        // Fractions of an HP carry over to the next second instead of rounding up to 1.
        me.regenAcc += Math.round(me.maxHp * me.passive.regenPct * 10)
        const got = heal(me, Math.trunc(me.regenAcc / 1000))
        me.regenAcc %= 1000
        if (got) log({ kind: 'regen', who: me.idx, amount: got, x: me.x, y: me.y })
      }

      let target = me.targetIdx >= 0 ? fighters[me.targetIdx] : null
      if (!target || !alive(target) || target.vanish > 0 || tick % 10 === me.idx % 10) {
        target = pickTarget(me)
        me.targetIdx = target ? target.idx : -1
      }
      if (!target) {
        if (me.act === ACT.DODGE || me.act === ACT.STUN || me.act === ACT.CHARGE) {
          me.x += me.vx
          me.y += me.vy
          if (--me.actT <= 0) {
            me.act = ACT.MOVE
            me.inv = false
          }
        }
        continue
      }
      const dx = target.x - me.x
      const dy = target.y - me.y
      const d = isqrt(dx * dx + dy * dy)
      if (dx !== 0) me.face = dx > 0 ? 1 : -1

      const ev = me.evade
      if (ev) {
        if (tick > ev.until) {
          me.evade = null
        } else if (ev.dashAt === tick) {
          dashNow(me, ev.fromX, ev.fromY, true, 0)
        } else if (ev.dashAt === 'charge') {
          const charger = fighters[ev.from]
          if (charger.act === ACT.CHARGE && dist(charger, me) < 80 * S) {
            dashNow(me, charger.x, charger.y, false, 8)
          }
        }
      }

      if (me.act === ACT.WIND) {
        if (--me.actT <= 0) release(me)
        continue
      }
      if (me.act === ACT.CHARGE) {
        me.x += me.vx
        me.y += me.vy
        if (!me.chargeHit) {
          const victim = enemiesOf(me).find(o => dist(me, o) <= 40 * S)
          if (victim) {
            me.chargeHit = true
            const sk = me.skills[me.kind]
            hit(me, victim, sk.power ?? 0, sk, { melee: true })
          }
        }
        if (--me.actT <= 0) {
          me.act = ACT.MOVE
          me.vx = 0
          me.vy = 0
        }
        continue
      }
      if (me.act === ACT.DODGE || me.act === ACT.STUN) {
        me.x += me.vx
        me.y += me.vy
        if (--me.actT <= 0) {
          me.act = ACT.MOVE
          me.inv = false
          me.seized = false
          me.vx = 0
          me.vy = 0
        }
        continue
      }

      // Standing in a marked zone: get out first.
      const danger = zones.find(z => z.team !== me.team && z.t > 0 && dist(me, z) <= (z.r + 20) * S)
      if (danger && !has(me, 'root')) {
        const [mx, my] = scaleTo(me.x - danger.x || 1, me.y - danger.y, stepOf(me))
        me.x += mx
        me.y += my
        continue
      }

      const pick = pickSkill(me, target, d)
      if (pick >= 0) {
        if (staticSeize(me)) continue
        const sk = me.skills[pick]
        const wind = sk.wind ?? 8
        me.act = ACT.WIND
        me.actT = wind
        me.kind = pick
        me.cds[pick] = Math.trunc((sec(sk.cd) * (100 - (me.passive.cdCut || 0))) / 100)
        // Self skills (buffs, heals, shields) only cost half the shared skill delay.
        const delay = Math.trunc((SKILL_DELAY_TICKS * attackTimePct(me)) / 100)
        me.gcd = wind + (sk.kind === 'self' ? Math.trunc(delay / 2) : delay)
        me.casts++
        log({ kind: 'skill', who: me.idx, skill: sk.name, icon: sk.icon, x: me.x, y: me.y })
        if (sk.kind === 'melee' || sk.kind === 'multi') {
          planDodge(target, me, tick + wind, me.x, me.y)
        } else if (sk.kind === 'burst') {
          for (const o of enemiesOf(me)) {
            if (dist(me, o) <= ((sk.radius ?? 0) + 30) * S) {
              planDodge(o, me, tick + wind, me.x, me.y)
            }
          }
        } else if (sk.kind === 'beam') {
          planDodge(target, me, tick + wind, me.x, me.y)
        }
        continue
      }
      if (me.basicCd === 0 && d <= BASIC_RANGE * S) {
        if (staticSeize(me)) continue
        me.act = ACT.WIND
        me.actT = BASIC_WIND
        me.kind = -1
        me.basicCd = Math.trunc((BASIC_CD * attackTimePct(me)) / 100)
        planDodge(target, me, tick + BASIC_WIND, me.x, me.y)
        continue
      }

      // Move.
      const step = stepOf(me)
      if (step === 0) continue
      if (roll(100) < 2) me.orbit = -me.orbit
      let mx: number
      let my: number
      const wantsRoom = me.skills.some(
        (sk, i) =>
          (sk.kind === 'shot' ||
            sk.kind === 'spread' ||
            sk.kind === 'charge' ||
            sk.kind === 'zone' ||
            sk.kind === 'beam') &&
          Math.max(me.cds[i], me.gcd) <= 15
      )
      if (wantsRoom && d < 120 * S) {
        const [ax, ay] = scaleTo(-dx, -dy, step)
        const [tx, ty] = scaleTo(-dy * me.orbit, dx * me.orbit, Math.trunc(step / 2))
        mx = ax + tx
        my = ay + ty
      } else if (me.basicCd > 6 && d < 150 * S) {
        const [tx, ty] = scaleTo(-dy * me.orbit, dx * me.orbit, step)
        const [bx, by] = scaleTo(-dx, -dy, Math.trunc(step / 3))
        mx = tx + bx
        my = ty + by
      } else {
        ;[mx, my] = scaleTo(dx, dy, step)
      }
      me.x += mx
      me.y += my
    }

    // Projectiles.
    for (const p of projectiles) {
      if (p.life <= 0) continue
      p.x += p.vx
      p.y += p.vy
      p.life--
      const t = fighters[p.aim]
      if (t.evade && t.evade.dashAt === 'proj' && t.evade.from === p.owner) {
        const pdx = t.x - p.x
        const pdy = t.y - p.y
        if (isqrt(pdx * pdx + pdy * pdy) < 90 * S) dashNow(t, p.x, p.y, false, 10)
      }
      for (const o of fighters) {
        if (o.team === p.team || !alive(o)) continue
        const ox = o.x - p.x
        const oy = o.y - p.y
        if (isqrt(ox * ox + oy * oy) <= PROJ_HIT) {
          p.life = 0
          hit(fighters[p.owner], o, p.skill.power ?? 0, p.skill)
          break
        }
      }
      if (p.x < 0 || p.x > W * S || p.y < 0 || p.y > H * S) p.life = 0
    }
    // Zones land.
    for (const z of zones) {
      if (z.t <= 0) continue
      if (--z.t === 0) {
        const owner = fighters[z.owner]
        log({ kind: 'zoneHit', who: z.owner, x: z.x, y: z.y, r: z.r, el: z.skill.el })
        for (const o of fighters) {
          if (o.team !== z.team && alive(o) && dist(o, z) <= z.r * S) {
            hit(owner, o, z.skill.power ?? 0, z.skill)
          }
        }
      }
    }

    // Keep apart and inside the arena.
    for (let i = 0; i < fighters.length; i++) {
      for (let j = i + 1; j < fighters.length; j++) {
        const a = fighters[i]
        const b = fighters[j]
        if (!alive(a) || !alive(b)) continue
        const gx = b.x - a.x
        const gy = b.y - a.y
        const gap = isqrt(gx * gx + gy * gy)
        if (gap < MIN_GAP) {
          const [px, py] = gap === 0 ? [S, 0] : scaleTo(gx, gy, Math.trunc((MIN_GAP - gap) / 2) + 1)
          a.x -= px
          a.y -= py
          b.x += px
          b.y += py
        }
      }
    }
    for (const me of fighters) {
      me.x = clamp(me.x, MARGIN * S, (W - MARGIN) * S)
      me.y = clamp(me.y, MARGIN * S, (H - MARGIN) * S)
    }
    recordFrame()

    const standing = [0, 1].map(t => fighters.some(f => f.team === t && alive(f)))
    if (!standing[0] || !standing[1]) {
      winner = standing[0] ? 0 : 1
      log({ kind: 'end', who: winner, reason: 'ko' })
      break
    }
  }
  if (winner < 0) {
    // Time up: the team with the larger share of HP left wins (integers, cross-multiplied).
    const share = [0, 1].map(t =>
      fighters.filter(f => f.team === t).reduce((s, f) => [s[0] + f.hp, s[1] + f.maxHp], [0, 0])
    )
    winner = share[0][0] * share[1][1] >= share[1][0] * share[0][1] ? 0 : 1
    tick = ARENA_MAX_TICKS
    log({ kind: 'end', who: winner, reason: 'time' })
  }

  let hash = 0x811c9dc5
  const mix = (n: number) => {
    hash ^= n & 0xffff
    hash = Math.imul(hash, 0x01000193) >>> 0
    hash ^= (n >>> 16) & 0xffff
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  for (const f of fighters) {
    mix(f.hp)
    mix(f.dealt)
    mix(f.x)
    mix(f.y)
  }
  mix(tick)

  return {
    seed,
    winner,
    ticks: Math.min(tick, ARENA_MAX_TICKS),
    frames,
    events,
    fighters: fighters.map(f => ({
      idx: f.idx,
      team: f.team,
      name: f.name,
      emoji: f.emoji,
      el: f.el,
      maxHp: f.maxHp,
      hp: f.hp,
      dealt: f.dealt,
      taken: f.taken,
      healed: f.healed,
      dodges: f.dodges,
      casts: f.casts,
      skills: f.skills.map(s => s.id),
      allSlots: f.allSlots.map(s => s.id),
      dodge: f.dodge ? f.dodge.id : null,
      spd: f.spd,
      eva: f.eva,
      acc: f.acc,
      res: f.res,
      boss: f.boss,
    })),
    checksum: hash.toString(16).padStart(8, '0'),
  }
}
