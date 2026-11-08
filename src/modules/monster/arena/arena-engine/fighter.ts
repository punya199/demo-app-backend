import { ARENA_HP_SCALE, MAX_RESIST } from '../arena-rules'
import { ArenaLine, IArenaFighterSpec, IArenaPassive, IArenaSkill, StatusId } from '../arena-types'
import { ACT, ARENA_SKILL_BY_ID, N, S, sec, TICK } from './constants'
import { tunedSkill, Tuning } from './skills'

export interface IStatusState {
  t: number
  mag?: number
  stacks?: number
  per?: number
  next?: number
  src?: number
  val?: number
}

export interface IEvade {
  from: number
  until: number
  parry: boolean
  dashAt: number | 'proj' | 'charge' | null
  fromX: number
  fromY: number
  active: boolean
  used: boolean
}

export interface IFighter {
  team: number
  idx: number
  name: string
  emoji: string
  sprite: string | null
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
  // Stages of `passive.grow` reached so far.
  grown: number
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

export interface IProjectile {
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

export interface IZone {
  owner: number
  team: number
  x: number
  y: number
  r: number
  t: number
  total: number
  skill: IArenaSkill
}

export const makeFighter = (
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
    sprite: spec.sprite ?? null,
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
    grown: 0,
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

export const has = (f: IFighter, st: StatusId) => !!f.st[st]
export const magOf = (f: IFighter, st: StatusId) => f.st[st]?.mag ?? 100

export const atkOf = (f: IFighter) => {
  let pct = 100
  if (has(f, 'atkUp')) pct += Math.trunc((N.atkUp * magOf(f, 'atkUp')) / 100)
  if (has(f, 'atkDown')) pct -= N.atkDown
  if (f.raging) pct += f.passive.rage?.atk ?? 0
  pct += f.grown * (f.passive.grow?.atk ?? 0)
  if (f.passive.enrage && f.hp * 100 < f.maxHp * f.passive.enrage.belowPct) {
    pct += f.passive.enrage.atk
  }
  return Math.trunc((f.atk * pct) / 100)
}
export const defOf = (f: IFighter) => {
  let pct = 100
  if (has(f, 'defUp')) pct += Math.trunc((N.defUp * magOf(f, 'defUp')) / 100)
  if (has(f, 'defDown')) pct -= N.defDown
  pct += f.grown * (f.passive.grow?.def ?? 0)
  return Math.trunc((f.def * pct) / 100)
}
export const resistOf = (f: IFighter, cc: boolean) =>
  Math.min(MAX_RESIST, f.res + (cc ? f.passive.tenacity || 0 : 0))
export const stepOf = (f: IFighter) => {
  if (has(f, 'root')) return 0
  let pct = 100 - (f.passive.moveCut || 0)
  if (has(f, 'haste')) pct += N.hasteMove
  if (has(f, 'slow')) pct -= N.slowMove
  return Math.trunc((f.baseStep * pct) / 100)
}
export const attackTimePct = (f: IFighter) => {
  let pct = 100 - (f.passive.attackSpeed || 0)
  if (has(f, 'haste')) pct -= N.hasteAttack
  if (has(f, 'slow')) pct += N.slowAttack
  return pct
}
export const evaOf = (f: IFighter) =>
  f.eva +
  (has(f, 'evaUp') ? Math.trunc((N.evaUp * magOf(f, 'evaUp')) / 100) : 0) -
  (has(f, 'evaDown') ? N.evaDown : 0)
