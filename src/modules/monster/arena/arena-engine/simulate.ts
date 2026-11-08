// Real-time arena battle engine (pure, deterministic): integer math and one seeded RNG, so the same
// fighters and seed always give the same fight on the server and in a replay. Port of the Monster
// Arena demo engine (same RNG order, so results match the demo the balance was tuned on). Supports
// teams, skill loadouts (innate + 2 + dodge), statuses with diminishing returns on hard CC, passives.
import { ARENA_TUNING } from '../arena-data'
import { ARENA_MAX_TICKS, SKILL_DELAY_TICKS } from '../arena-rules'
import { IArenaFighterSpec, IArenaResult, StatusId } from '../arena-types'
import { attackTimePct, has, makeFighter, stepOf } from './fighter'
import { Tuning } from './skills'
import {
  ACT,
  BASIC_CD,
  BASIC_RANGE,
  BASIC_WIND,
  clamp,
  createRng,
  dist,
  H,
  isqrt,
  MARGIN,
  MIN_GAP,
  PROJ_HIT,
  S,
  scaleTo,
  sec,
  TICK,
  W,
} from './constants'
import { alive, enemiesOf, ISim, log, pickTarget, recordFrame, roll } from './context'
import { dashNow, hit } from './damage'
import { planDodge } from './dodge'
import { release } from './attack'
import { pickSkill, staticSeize } from './skill-ai'
import { giveShield, heal, checkLowHp } from './status'

export interface IArenaOptions {
  record?: boolean
  tuning?: Tuning
}

export const simulateArena = (
  teams: IArenaFighterSpec[][],
  seed: number,
  options: IArenaOptions = {}
): IArenaResult => {
  const rng = createRng(seed)
  const c: ISim = {
    record: !!options.record,
    tuning: options.tuning ?? ARENA_TUNING,
    rng,
    fighters: [],
    projectiles: [],
    zones: [],
    frames: [],
    events: [],
    tick: 0,
    winner: -1,
  }
  teams.forEach((team, t) => {
    team.forEach((spec, i) => {
      const n = team.length
      const x = t === 0 ? 150 : W - 150
      const y = H / 2 + (n === 1 ? (t === 0 ? 40 : -40) : Math.round((i - (n - 1) / 2) * 110))
      c.fighters.push(makeFighter(spec, t, c.fighters.length, [x, y], c.tuning))
    })
  })

  log(c, { kind: 'start' })
  recordFrame(c)

  for (c.tick = 1; c.tick <= ARENA_MAX_TICKS; c.tick++) {
    // Seeded shuffle of who acts first this tick.
    const order = c.fighters.slice()
    for (let i = order.length - 1; i > 0; i--) {
      const j = roll(c, i + 1)
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
        if ((st === 'burn' || st === 'poison') && c.tick >= (s.next ?? 0)) {
          s.next = c.tick + TICK
          const src = c.fighters[s.src ?? 0]
          const dmg = st === 'poison' ? (s.per ?? 0) * (s.stacks ?? 1) : (s.per ?? 0)
          const lost = Math.min(me.hp, dmg)
          me.hp -= lost
          me.taken += lost
          src.dealt += lost
          log(c, { kind: 'dot', who: me.idx, st, dmg: lost, x: me.x, y: me.y })
          checkLowHp(c, me)
          if (!alive(me)) break
        }
        if (st === 'regen' && c.tick >= (s.next ?? 0)) {
          s.next = c.tick + TICK
          const got = heal(c, me, Math.trunc((me.maxHp * (s.val ?? 0)) / 100))
          if (got) log(c, { kind: 'regen', who: me.idx, amount: got, x: me.x, y: me.y })
        }
        if (me.st[st] === s && --s.t <= 0) delete me.st[st]
      }
      if (!alive(me)) continue
      if (me.passive.rage && !me.raging && c.tick >= sec(me.passive.rage.sec)) {
        me.raging = true
        log(c, { kind: 'rage', who: me.idx, x: me.x, y: me.y })
      }
      const grow = me.passive.grow
      if (grow) {
        const stages = grow.secs.filter(at => c.tick >= sec(at)).length
        while (me.grown < stages) {
          me.grown++
          log(c, { kind: 'grow', who: me.idx, x: me.x, y: me.y })
        }
      }
      const refresh = me.passive.shieldEvery
      if (refresh && c.tick % sec(refresh.sec) === 0) giveShield(c, me, refresh.pct, refresh.sec)
      if (me.passive.regenPct && c.tick % TICK === me.idx % TICK) {
        // Fractions of an HP carry over to the next second instead of rounding up to 1.
        me.regenAcc += Math.round(me.maxHp * me.passive.regenPct * 10)
        const got = heal(c, me, Math.trunc(me.regenAcc / 1000))
        me.regenAcc %= 1000
        if (got) log(c, { kind: 'regen', who: me.idx, amount: got, x: me.x, y: me.y })
      }

      let target = me.targetIdx >= 0 ? c.fighters[me.targetIdx] : null
      if (!target || !alive(target) || target.vanish > 0 || c.tick % 10 === me.idx % 10) {
        target = pickTarget(c, me)
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
        if (c.tick > ev.until) {
          me.evade = null
        } else if (ev.dashAt === c.tick) {
          dashNow(c, me, ev.fromX, ev.fromY, true, 0)
        } else if (ev.dashAt === 'charge') {
          const charger = c.fighters[ev.from]
          if (charger.act === ACT.CHARGE && dist(charger, me) < 80 * S) {
            dashNow(c, me, charger.x, charger.y, false, 8)
          }
        }
      }

      if (me.act === ACT.WIND) {
        if (--me.actT <= 0) release(c, me)
        continue
      }
      if (me.act === ACT.CHARGE) {
        me.x += me.vx
        me.y += me.vy
        if (!me.chargeHit) {
          const victim = enemiesOf(c, me).find(o => dist(me, o) <= 40 * S)
          if (victim) {
            me.chargeHit = true
            const sk = me.skills[me.kind]
            hit(c, me, victim, sk.power ?? 0, sk, { melee: true })
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
      const danger = c.zones.find(
        z => z.team !== me.team && z.t > 0 && dist(me, z) <= (z.r + 20) * S
      )
      if (danger && !has(me, 'root')) {
        const [mx, my] = scaleTo(me.x - danger.x || 1, me.y - danger.y, stepOf(me))
        me.x += mx
        me.y += my
        continue
      }

      const pick = pickSkill(c, me, target, d)
      if (pick >= 0) {
        if (staticSeize(c, me)) continue
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
        log(c, { kind: 'skill', who: me.idx, skill: sk.name, icon: sk.icon, x: me.x, y: me.y })
        if (sk.kind === 'melee' || sk.kind === 'multi') {
          planDodge(c, target, me, c.tick + wind, me.x, me.y)
        } else if (sk.kind === 'burst') {
          for (const o of enemiesOf(c, me)) {
            if (dist(me, o) <= ((sk.radius ?? 0) + 30) * S) {
              planDodge(c, o, me, c.tick + wind, me.x, me.y)
            }
          }
        } else if (sk.kind === 'beam') {
          planDodge(c, target, me, c.tick + wind, me.x, me.y)
        }
        continue
      }
      if (me.basicCd === 0 && d <= BASIC_RANGE * S) {
        if (staticSeize(c, me)) continue
        me.act = ACT.WIND
        me.actT = BASIC_WIND
        me.kind = -1
        me.basicCd = Math.trunc((BASIC_CD * attackTimePct(me)) / 100)
        planDodge(c, target, me, c.tick + BASIC_WIND, me.x, me.y)
        continue
      }

      // Move.
      const step = stepOf(me)
      if (step === 0) continue
      if (roll(c, 100) < 2) me.orbit = -me.orbit
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
    for (const p of c.projectiles) {
      if (p.life <= 0) continue
      p.x += p.vx
      p.y += p.vy
      p.life--
      const t = c.fighters[p.aim]
      if (t.evade && t.evade.dashAt === 'proj' && t.evade.from === p.owner) {
        const pdx = t.x - p.x
        const pdy = t.y - p.y
        if (isqrt(pdx * pdx + pdy * pdy) < 90 * S) dashNow(c, t, p.x, p.y, false, 10)
      }
      for (const o of c.fighters) {
        if (o.team === p.team || !alive(o)) continue
        const ox = o.x - p.x
        const oy = o.y - p.y
        if (isqrt(ox * ox + oy * oy) <= PROJ_HIT) {
          p.life = 0
          hit(c, c.fighters[p.owner], o, p.skill.power ?? 0, p.skill)
          break
        }
      }
      if (p.x < 0 || p.x > W * S || p.y < 0 || p.y > H * S) p.life = 0
    }
    // Zones land.
    for (const z of c.zones) {
      if (z.t <= 0) continue
      if (--z.t === 0) {
        const owner = c.fighters[z.owner]
        log(c, { kind: 'zoneHit', who: z.owner, x: z.x, y: z.y, r: z.r, el: z.skill.el })
        for (const o of c.fighters) {
          if (o.team !== z.team && alive(o) && dist(o, z) <= z.r * S) {
            hit(c, owner, o, z.skill.power ?? 0, z.skill)
          }
        }
      }
    }

    // Keep apart and inside the arena.
    for (let i = 0; i < c.fighters.length; i++) {
      for (let j = i + 1; j < c.fighters.length; j++) {
        const a = c.fighters[i]
        const b = c.fighters[j]
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
    for (const me of c.fighters) {
      me.x = clamp(me.x, MARGIN * S, (W - MARGIN) * S)
      me.y = clamp(me.y, MARGIN * S, (H - MARGIN) * S)
    }
    recordFrame(c)

    const standing = [0, 1].map(t => c.fighters.some(f => f.team === t && alive(f)))
    if (!standing[0] || !standing[1]) {
      c.winner = standing[0] ? 0 : 1
      log(c, { kind: 'end', who: c.winner, reason: 'ko' })
      break
    }
  }
  if (c.winner < 0) {
    // Time up: the team with the larger share of HP left wins (integers, cross-multiplied).
    const share = [0, 1].map(t =>
      c.fighters.filter(f => f.team === t).reduce((s, f) => [s[0] + f.hp, s[1] + f.maxHp], [0, 0])
    )
    c.winner = share[0][0] * share[1][1] >= share[1][0] * share[0][1] ? 0 : 1
    c.tick = ARENA_MAX_TICKS
    log(c, { kind: 'end', who: c.winner, reason: 'time' })
  }

  let hash = 0x811c9dc5
  const mix = (n: number) => {
    hash ^= n & 0xffff
    hash = Math.imul(hash, 0x01000193) >>> 0
    hash ^= (n >>> 16) & 0xffff
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  for (const f of c.fighters) {
    mix(f.hp)
    mix(f.dealt)
    mix(f.x)
    mix(f.y)
  }
  mix(c.tick)

  return {
    seed,
    winner: c.winner,
    ticks: Math.min(c.tick, ARENA_MAX_TICKS),
    frames: c.frames,
    events: c.events,
    fighters: c.fighters.map(f => ({
      idx: f.idx,
      team: f.team,
      name: f.name,
      emoji: f.emoji,
      sprite: f.sprite,
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
