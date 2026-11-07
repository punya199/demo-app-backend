import { ARENA_STATUS } from '../arena-data'
import { IArenaEvent, IArenaFrame, StatusId } from '../arena-types'
import { dist, STATUS_BIT } from './constants'
import { IFighter, IProjectile, IZone, resistOf } from './fighter'
import { Tuning } from './skills'

// Mutable state of one simulated fight, shared by every part of the engine.
export interface ISim {
  record: boolean
  tuning: Tuning
  rng: () => number
  fighters: IFighter[]
  projectiles: IProjectile[]
  zones: IZone[]
  frames: IArenaFrame[]
  events: IArenaEvent[]
  tick: number
  winner: number
}

export const roll = (c: ISim, n: number) => c.rng() % n

export const lands = (c: ISim, f: IFighter, ch: number, st: StatusId) =>
  ch >= 100 || roll(c, 100) < Math.trunc((ch * (100 - resistOf(f, !!ARENA_STATUS[st].cc))) / 100)

export const log = (c: ISim, e: Omit<IArenaEvent, 't'>) => {
  if (c.record) c.events.push({ t: c.tick, ...e })
}
export const alive = (f: IFighter) => f.hp > 0
export const enemiesOf = (c: ISim, f: IFighter) =>
  c.fighters.filter(o => o.team !== f.team && alive(o))
export const pickTarget = (c: ISim, f: IFighter) => {
  let best: IFighter | null = null
  let bestD = 0
  for (const o of c.fighters) {
    if (o.team === f.team || !alive(o) || o.vanish > 0) continue
    const d = dist(f, o)
    if (!best || d < bestD) {
      best = o
      bestD = d
    }
  }
  return best
}

export const recordFrame = (c: ISim) => {
  if (!c.record) return
  c.frames.push({
    f: c.fighters.map(me => {
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
    p: c.projectiles
      .filter(p => p.life > 0)
      .map(p => [p.x, p.y, p.team, p.skill.el || c.fighters[p.owner].el]),
    z: c.zones
      .filter(z => z.t > 0)
      .map(z => [z.x, z.y, z.r, z.t, z.total, z.skill.el || c.fighters[z.owner].el]),
  })
}
