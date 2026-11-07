import { ARENA_STATUS } from '../arena-data'
import { EXECUTE_BELOW } from '../arena-rules'
import { StatusId } from '../arena-types'
import { ACT, dist, N, S, sec } from './constants'
import { enemiesOf, ISim, log, roll } from './context'
import { has, IFighter } from './fighter'

// Which ready skill fits now (scored; ties keep slot order).
export const pickSkill = (c: ISim, me: IFighter, target: IFighter, d: number) => {
  if (me.gcd > 0 || has(me, 'silence')) return -1
  let best = -1
  let bestScore = 0
  const dpx = d / S
  const hpPct = Math.trunc((me.hp * 100) / me.maxHp)
  const debuffed = (Object.keys(me.st) as StatusId[]).some(st => ARENA_STATUS[st].kind === 'debuff')
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
        const n = enemiesOf(c, me).filter(o => dist(center, o) <= r).length
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
export const staticSeize = (c: ISim, me: IFighter) => {
  if (has(me, 'static') && roll(c, 100) < N.staticChance) {
    me.act = ACT.STUN
    me.actT = sec(N.staticStunSec)
    me.seized = true
    log(c, { kind: 'seize', who: me.idx })
    return true
  }
  return false
}
