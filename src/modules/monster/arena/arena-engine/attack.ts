import { ACT, BASIC, BASIC_RANGE, dist, isqrt, PROJ_SPEED, S, scaleTo } from './constants'
import { alive, enemiesOf, ISim, log, roll } from './context'
import { stepOf, IFighter } from './fighter'
import { IArenaSkill } from '../arena-types'
import { planDodge } from './dodge'
import { hit } from './damage'
import { addStatus, cleanse, giveShield, heal } from './status'

export const fire = (c: ISim, me: IFighter, target: IFighter, skill: IArenaSkill) => {
  const n = skill.hits || 1
  const dx = target.x - me.x
  const dy = target.y - me.y
  const span = n === 1 ? 0 : 56
  planDodge(c, target, me, 'proj', me.x, me.y)
  for (let i = 0; i < n; i++) {
    const off = n === 1 ? 0 : Math.trunc(-span / 2 + (span * i) / (n - 1))
    const [px, py] = scaleTo(-dy, dx, Math.trunc((isqrt(dx * dx + dy * dy) * off) / 100) || 0)
    const [vx, vy] = scaleTo(dx + px, dy + py, PROJ_SPEED)
    c.projectiles.push({
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

export const release = (c: ISim, me: IFighter) => {
  const sk = me.kind < 0 ? BASIC : me.skills[me.kind]
  const target = me.targetIdx >= 0 ? c.fighters[me.targetIdx] : null
  me.act = ACT.MOVE
  if (sk !== BASIC) {
    if (sk.fx) for (const e of sk.fx) if (e.to === 'self') addStatus(c, me, e.st, e.dur, me, e)
    if (sk.heal) {
      const got = heal(c, me, Math.trunc((me.maxHp * sk.heal) / 100))
      log(c, { kind: 'heal', who: me.idx, amount: got, x: me.x, y: me.y })
    }
    if (sk.shield) giveShield(c, me, sk.shield, sk.shieldSec || 4)
    if (sk.cleanse) cleanse(c, me)
    if (sk.cleanseOnly) cleanse(c, me, sk.cleanseOnly)
  }
  if (sk.kind === 'self') return
  if (!target || !alive(target)) return
  const d = dist(me, target)
  const power = sk.power ?? 0
  if (sk.kind === 'melee' || sk.kind === 'multi') {
    if (d <= ((sk.range || BASIC_RANGE) + 16) * S) {
      for (let i = 0; i < (sk.hits || 1); i++) {
        hit(c, me, target, power, sk === BASIC ? null : sk, { melee: true })
      }
      if (sk === BASIC && me.passive.doubleStrike && roll(c, 100) < me.passive.doubleStrike) {
        hit(c, me, target, power, null, { melee: true })
      }
    } else {
      log(c, { kind: 'miss', who: me.idx, target: target.idx })
    }
  } else if (sk.kind === 'shot' || sk.kind === 'spread') {
    fire(c, me, target, sk)
  } else if (sk.kind === 'burst') {
    const radius = sk.radius ?? 0
    log(c, { kind: 'burst', who: me.idx, x: me.x, y: me.y, r: radius, el: sk.el })
    for (const o of enemiesOf(c, me)) if (dist(me, o) <= radius * S) hit(c, me, o, power, sk)
  } else if (sk.kind === 'beam') {
    const [ux, uy] = scaleTo(target.x - me.x, target.y - me.y, 1000)
    const len = (sk.length ?? 0) * S
    const width = sk.width ?? 0
    log(c, {
      kind: 'beam',
      who: me.idx,
      x: me.x,
      y: me.y,
      x2: me.x + Math.trunc((ux * len) / 1000),
      y2: me.y + Math.trunc((uy * len) / 1000),
      w: width,
      el: sk.el,
    })
    for (const o of enemiesOf(c, me)) {
      const rx = o.x - me.x
      const ry = o.y - me.y
      const along = Math.trunc((rx * ux + ry * uy) / 1000)
      const across = Math.abs(Math.trunc((rx * uy - ry * ux) / 1000))
      if (along >= 0 && along <= len && across <= width * S) hit(c, me, o, power, sk)
    }
  } else if (sk.kind === 'zone') {
    const radius = sk.radius ?? 0
    const delay = sk.delay ?? 0
    c.zones.push({
      owner: me.idx,
      team: me.team,
      x: target.x,
      y: target.y,
      r: radius,
      t: delay,
      total: delay,
      skill: sk,
    })
    for (const o of enemiesOf(c, me)) {
      if (dist(o, target) <= (radius + 30) * S) {
        planDodge(c, o, me, c.tick + delay, target.x, target.y)
      }
    }
    log(c, { kind: 'zone', who: me.idx, x: target.x, y: target.y, r: radius, el: sk.el })
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
    planDodge(c, target, me, 'charge', me.x, me.y)
    if (target.evade && target.evade.from === me.idx) target.evade.until = c.tick + 14
  }
}
