import { DODGE_BASE, DODGE_MAX, DODGE_MIN_CD } from '../arena-rules'
import { ACT, clamp, DASH_TICKS, scaleTo, sec } from './constants'
import { alive, ISim, roll } from './context'
import { evaOf, has, IFighter, stepOf } from './fighter'

export const canDash = (c: ISim, f: IFighter) =>
  alive(f) &&
  !has(f, 'stun') &&
  !f.seized &&
  (f.act === ACT.MOVE || f.act === ACT.STUN || (f.act === ACT.WIND && f.kind === -1))
export const startDash = (c: ISim, f: IFighter, fromX: number, fromY: number, away: boolean) => {
  const dx = f.x - fromX
  const dy = f.y - fromY
  let px: number
  let py: number
  const len = Math.max(stepOf(f), f.baseStep / 2) * 3
  if (away || (dx === 0 && dy === 0)) {
    ;[px, py] = scaleTo(dx || 1, dy, len)
  } else {
    const sign = roll(c, 2) === 0 ? 1 : -1
    ;[px, py] = scaleTo(-dy * sign, dx * sign, len)
  }
  if (f.act === ACT.WIND) f.kind = -1
  f.act = ACT.DODGE
  f.actT = DASH_TICKS
  f.vx = Math.trunc(px)
  f.vy = Math.trunc(py)
  f.inv = true
}
export const dodgeRoll = (c: ISim, d: IFighter, a: IFighter) => {
  if (!d.dodge?.dodge || d.dodgeCd > 0 || !canDash(c, d)) return false
  // Evasion against the attacker's accuracy; speed plays no part.
  const chance = clamp(DODGE_BASE + evaOf(d) - a.acc + d.dodge.dodge.chance, 10, DODGE_MAX)
  d.dodgeCd = sec(Math.max(DODGE_MIN_CD, d.dodge.dodge.cd - (d.passive.dodgeCdCut || 0)))
  return roll(c, 100) < chance
}
// landTick: when the blow lands; 'proj' = when the projectile gets close; 'charge' = when the
// charger gets close. A parry needs no dash; a dash must still be possible at that moment.
export const planDodge = (
  c: ISim,
  d: IFighter,
  a: IFighter,
  landTick: number | 'proj' | 'charge',
  fromX: number,
  fromY: number
) => {
  if (!dodgeRoll(c, d, a)) return
  const parry = !!d.dodge?.dodge?.parry
  const timed = typeof landTick === 'number'
  d.evade = {
    from: a.idx,
    until: timed ? landTick + 2 : c.tick + 70,
    parry,
    dashAt: parry ? null : timed ? landTick - 2 : landTick,
    fromX,
    fromY,
    active: parry,
    used: false,
  }
}
