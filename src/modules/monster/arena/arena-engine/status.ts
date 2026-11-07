import { ARENA_STATUS } from '../arena-data'
import { IArenaFx, StatusId } from '../arena-types'
import { ACT, N, sec, TICK } from './constants'
import { ISim, log, alive } from './context'
import { atkOf, has, IFighter, resistOf } from './fighter'

export const addStatus = (
  c: ISim,
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
      log(c, { kind: 'resist', who: f.idx, st })
      return
    }
    f.ccCount = c.tick < f.ccUntil ? f.ccCount + 1 : 0
    const pct = N.ccSteps[Math.min(f.ccCount, N.ccSteps.length - 1)]
    dur = Math.trunc((dur * pct) / 100)
    if (dur <= 0) {
      log(c, { kind: 'resist', who: f.idx, st })
      return
    }
    f.ccUntil = c.tick + dur + sec(N.ccWindowSec)
  }
  const cur = f.st[st]
  if (st === 'poison') {
    const per = Math.max(1, Math.trunc((src.atk * N.poisonAtkPctPerSec) / 100))
    f.st.poison = {
      t: Math.max(cur ? cur.t : 0, dur),
      stacks: Math.min(N.poisonMaxStacks, (cur?.stacks ?? 0) + 1),
      per: Math.max(cur?.per ?? 0, per),
      next: cur?.next ?? c.tick + TICK,
      src: src.idx,
    }
  } else if (st === 'burn') {
    const per = Math.max(1, Math.trunc((atkOf(src) * N.burnAtkPctPerSec) / 100))
    f.st.burn = {
      t: Math.max(cur ? cur.t : 0, dur),
      per: Math.max(cur?.per ?? 0, per),
      next: cur?.next ?? c.tick + TICK,
      src: src.idx,
    }
  } else if (st === 'regen') {
    f.st.regen = {
      t: Math.max(cur ? cur.t : 0, dur),
      val: extra.val || 1,
      next: cur?.next ?? c.tick + TICK,
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
  log(c, { kind: 'status', who: f.idx, st, dur })
}
export const cleanse = (c: ISim, f: IFighter, only?: StatusId[]) => {
  let n = 0
  for (const st of Object.keys(f.st) as StatusId[]) {
    if (ARENA_STATUS[st].kind !== 'debuff') continue
    if (only && !only.includes(st)) continue
    delete f.st[st]
    n++
  }
  if (f.act === ACT.STUN && !only) f.actT = 0
  if (n) log(c, { kind: 'cleanse', who: f.idx })
}
export const heal = (c: ISim, f: IFighter, amount: number) => {
  if (has(f, 'curse')) amount = Math.trunc((amount * (100 - N.curse)) / 100)
  const got = Math.min(f.maxHp - f.hp, Math.max(0, amount))
  f.hp += got
  f.healed += got
  return got
}
export const giveShield = (c: ISim, f: IFighter, pct: number, durSec: number) => {
  let amount = Math.trunc((f.maxHp * pct) / 100)
  if (has(f, 'curse')) amount = Math.trunc((amount * (100 - N.curse)) / 100)
  if (amount > f.shield) f.shield = amount
  f.shieldT = Math.max(f.shieldT, sec(durSec))
  log(c, { kind: 'shield', who: f.idx, amount: f.shield })
}

export const checkLowHp = (c: ISim, f: IFighter) => {
  const p = f.passive
  if (f.hp === 0 && p.rebirthPct && !f.rebirthUsed) {
    f.rebirthUsed = true
    f.hp = Math.max(1, Math.trunc((f.maxHp * p.rebirthPct) / 100))
    cleanse(c, f)
    log(c, { kind: 'rebirth', who: f.idx, amount: f.hp })
    return
  }
  if (p.lastStand && !f.lastStandUsed && f.hp > 0 && f.hp * 100 < f.maxHp * p.lastStand.belowPct) {
    f.lastStandUsed = true
    cleanse(c, f)
    giveShield(c, f, p.lastStand.shield, 6)
    f.st.immune = { t: sec(p.lastStand.immuneSec) }
    log(c, { kind: 'laststand', who: f.idx })
  }
  if (f.hp === 0) {
    f.act = ACT.MOVE
    log(c, { kind: 'ko', who: f.idx })
  }
}
