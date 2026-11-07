import { arenaEffectiveness, CRIT_CHANCE, CRIT_MULTIPLIER, EXECUTE_BELOW } from '../arena-rules'
import { ArenaElement, IArenaSkill } from '../arena-types'
import {
  ACT,
  BASIC,
  COUNTER_RANGE,
  DEFENSE_K,
  dist,
  DMG_SCALE,
  HITSTUN,
  MAX_DEF_CUT,
  N,
  RETORT_RANGE,
  sec,
  S,
  scaleTo,
  VAR_MIN,
  VAR_SPAN,
} from './constants'
import { alive, ISim, lands, log, roll } from './context'
import { atkOf, defOf, has, IFighter, magOf } from './fighter'
import { canDash, startDash } from './dodge'
import { addStatus, checkLowHp, cleanse, heal } from './status'

export const onDodged = (c: ISim, d: IFighter, a: IFighter) => {
  d.dodges++
  const od = d.dodge?.dodge?.onDodge
  if (od) {
    if (od.haste) addStatus(c, d, 'haste', od.haste, d)
    if (od.cleanse) cleanse(c, d)
    if (od.blindAttacker) addStatus(c, a, 'blind', od.blindAttacker, d)
    if (od.vanish) d.vanish = Math.max(d.vanish, sec(od.vanish))
    if (od.critNext) d.critNext = true
    if (od.counter && alive(a) && dist(a, d) <= COUNTER_RANGE) {
      hit(
        c,
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

export const dashNow = (
  c: ISim,
  f: IFighter,
  fromX: number,
  fromY: number,
  away: boolean,
  window: number
) => {
  const ev = f.evade
  if (!ev || !canDash(c, f)) {
    f.evade = null
    return
  }
  startDash(c, f, fromX, fromY, away)
  ev.active = true
  ev.dashAt = null
  if (window) ev.until = c.tick + window
  // A dash taken against a known attack avoids it: it counts (and triggers dodge effects) now.
  ev.used = true
  log(c, { kind: 'dodge', who: f.idx, by: ev.from, x: f.x, y: f.y })
  onDodged(c, f, c.fighters[ev.from])
}

// ----- damage -----
// One hit. `power` in % of ATK; `skill` null = a basic attack; `melee` enables retorts.
export function hit(
  c: ISim,
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
  if (d.vanish > 0 || (ev && ev.active && ev.from === a.idx && c.tick <= ev.until)) {
    if (ev && ev.parry && d.vanish === 0) {
      parried = true
    } else {
      log(c, { kind: 'dodge', who: d.idx, by: a.idx, x: d.x, y: d.y })
      if (ev && !ev.used) {
        ev.used = true
        onDodged(c, d, a)
      }
      return
    }
  }
  if (has(a, 'blind') && roll(c, 100) < N.blindMiss) {
    log(c, { kind: 'miss', who: a.idx, target: d.idx })
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
  const variance = VAR_MIN + roll(c, VAR_SPAN)
  const critRoll = roll(c, 100)
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
  if (ls && lost > 0) healed = heal(c, a, Math.max(1, Math.trunc((lost * ls) / 100)))
  if (d.passive.thorns && lost > 0 && !opt.isRetort) {
    const back = Math.min(a.hp, Math.max(1, Math.trunc((lost * d.passive.thorns) / 100)))
    a.hp -= back
    a.taken += back
    d.dealt += back
    log(c, { kind: 'thorns', who: a.idx, by: d.idx, dmg: back, x: a.x, y: a.y })
  }
  // At most one flinch per half second, so a volley of small hits can't lock a target in place.
  if (d.act === ACT.MOVE && d.hp > 0 && c.tick >= d.flinchReady) {
    d.flinchReady = c.tick + 10
    const [kx, ky] = scaleTo(d.x - a.x, d.y - a.y, 8 * S)
    d.act = ACT.STUN
    d.actT = HITSTUN
    d.vx = Math.trunc(kx / HITSTUN)
    d.vy = Math.trunc(ky / HITSTUN)
  }
  log(c, {
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
      if (lands(c, d, e.ch, e.st)) addStatus(c, d, e.st, e.dur, a, e)
    }
  }
  if (d.hp > 0 && !skill && a.passive.onBasic) {
    const ob = a.passive.onBasic
    if (lands(c, d, ob.ch, ob.st)) addStatus(c, d, ob.st, ob.dur, a)
  }
  if (!skill && a.passive.onBasicExtra) {
    for (const extra of a.passive.onBasicExtra) {
      if (alive(d) && lands(c, d, extra.ch, extra.st)) addStatus(c, d, extra.st, extra.dur, a)
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
      hit(c, d, a, r.power, { ...BASIC, name: 'สวนกลับ', el: d.el, fx: [] }, { isRetort: true })
    }
    if (alive(a) && lands(c, a, r.ch, r.st)) addStatus(c, a, r.st, r.dur, d)
  }
  checkLowHp(c, d)
  checkLowHp(c, a)
}
