// Monster Arena engine (pure, deterministic): integer math and one seeded RNG, so the same teams and
// seed always give the same fight, in any browser or on a server. Supports teams (pack stages),
// skill loadouts (innate + 2 + dodge), statuses with diminishing returns on hard CC, and passives.

const ARENA_ENGINE = (() => {
  'use strict'
  const D = typeof ARENA_DATA !== 'undefined' ? ARENA_DATA : require('./data.js')
  const { BEATS, STRONG, WEAK, STATUS, STATUS_NUMBERS: N } = D

  const TICK = 20
  const S = 100
  const W = 640
  const H = 440
  const MARGIN = 36
  const MAX_TICKS = 60 * TICK
  const HP_SCALE = 3
  const PROJ_SPEED = 13 * S
  const PROJ_HIT = 26 * S
  const BASIC_CD = 24
  const BASIC_WIND = 7
  const BASIC_RANGE = 54
  const DASH_TICKS = 5
  const HITSTUN = 4
  const MIN_GAP = 34 * S
  const DEFENSE_K = 40
  const MAX_DEF_CUT = 7500
  const CRIT_CHANCE = 15
  const CRIT_MUL = 150
  const VAR_MIN = 80
  const VAR_SPAN = 41 // 80..120
  const DMG_SCALE = 1000000
  // Shared delay after a skill (ticks). SPD no longer shortens it: SPD is movement only.
  const SKILL_DELAY = 27
  // RES and tenacity together never cut a status by more than this.
  const MAX_RESIST = 70
  const DODGE_BASE = 50
  const DODGE_MAX = 75
  // No dodge comes back faster than this, whatever the skill's tuning.
  const DODGE_MIN_CD = 4
  // A self buff never lasts longer than this share of its skill's cooldown (no near-permanent buffs).
  const MAX_BUFF_UPTIME = 50
  const EXECUTE_BELOW = 35
  const RETORT_RANGE = 90 * S
  const COUNTER_RANGE = 160 * S

  const STATUS_IDS = Object.keys(STATUS)
  const STATUS_BIT = Object.fromEntries(STATUS_IDS.map((id, i) => [id, 1 << i]))
  const SKILL_BY_ID = Object.fromEntries([...D.SKILLS, ...(D.ENEMY_SKILLS || [])].map((s) => [s.id, s]))

  const ACT = { MOVE: 0, WIND: 1, DODGE: 2, STUN: 3, CHARGE: 4 }
  const BASIC = { id: 'basic', name: 'โจมตี', icon: '👊', kind: 'melee', power: 100, hits: 1, range: BASIC_RANGE, wind: BASIC_WIND, el: null }

  const sec = (x) => Math.round(x * TICK)

  const createRng = (seed) => {
    let v = seed >>> 0
    return () => {
      v = (v + 0x6d2b79f5) >>> 0
      let t = v
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return (t ^ (t >>> 14)) >>> 0
    }
  }
  const isqrt = (n) => {
    if (n < 2) return n
    let x = n
    let y = Math.floor((x + 1) / 2)
    while (y < x) {
      x = y
      y = Math.floor((x + Math.floor(n / x)) / 2)
    }
    return x
  }
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
  const scaleTo = (dx, dy, len) => {
    const d = isqrt(dx * dx + dy * dy) || 1
    return [Math.trunc((dx * len) / d), Math.trunc((dy * len) / d)]
  }
  const dist = (a, b) => {
    const dx = b.x - a.x
    const dy = b.y - a.y
    return isqrt(dx * dx + dy * dy)
  }
  const effectiveness = (atkEl, defEl) => {
    if (!atkEl || atkEl === 'neutral') return 100
    if ((BEATS[atkEl] || []).includes(defEl)) return STRONG
    if ((BEATS[defEl] || []).includes(atkEl)) return WEAK
    return 100
  }

  // A skill with this run's tuning applied (cooldown and strength multipliers in percent).
  const tuned = (skill, tuning) => {
    const t = tuning && tuning[skill.id]
    if (!t) return skill
    const pow = t.pow ?? 100
    const out = { ...skill }
    if (t.cd) out.cd = Math.round(skill.cd * t.cd) / 100
    if (skill.power) out.power = Math.round((skill.power * pow) / 100)
    if (skill.heal) out.heal = Math.round((skill.heal * pow) / 100)
    if (skill.shield) out.shield = Math.round((skill.shield * pow) / 100)
    // Strength also stretches status durations (and regen per second), so a skill whose value is
    // its status can be tuned the same way as a damage skill.
    const dur = t.dur ?? pow
    if (skill.fx && dur !== 100) out.fx = skill.fx.map((e) => ({ ...e, dur: Math.round(e.dur * dur) / 100, ...(e.val && { val: Math.round(e.val * dur) / 100 }) }))
    // A self buff is capped at MAX_BUFF_UPTIME of the cooldown; strength the cap cuts off goes into
    // the buff's size instead (up to x2.5), so strong buffs get bigger, not permanent.
    if (out.fx && out.cd)
      out.fx = out.fx.map((e) => {
        if (e.to !== 'self') return e
        const cap = Math.round(out.cd * MAX_BUFF_UPTIME) / 100
        if (e.dur <= cap) return e
        return { ...e, dur: cap, mag: Math.min(250, Math.round((e.dur * 100) / cap)) }
      })
    if (skill.passive && pow !== 100) out.passive = scalePassive(skill.passive, pow)
    if (skill.dodge && (t.cd || t.chance)) out.dodge = { ...skill.dodge, cd: Math.round(skill.dodge.cd * (t.cd || 100)) / 100, chance: skill.dodge.chance + (t.chance || 0) }
    return out
  }
  const scalePassive = (p, pow) => {
    const k = (v) => Math.round((v * pow) / 100 * 10) / 10
    const out = { ...p }
    if (p.rebirthPct) out.rebirthPct = k(p.rebirthPct)
    if (p.regenPct) out.regenPct = k(p.regenPct)
    if (p.damageCut) out.damageCut = k(p.damageCut)
    if (p.tenacity) out.tenacity = k(p.tenacity)
    if (p.basicLifesteal) out.basicLifesteal = k(p.basicLifesteal)
    if (p.eva) out.eva = k(p.eva)
    if (p.dodgeCdCut) out.dodgeCdCut = k(p.dodgeCdCut)
    if (p.meleeRetort) out.meleeRetort = { ...p.meleeRetort, power: k(p.meleeRetort.power), ch: Math.min(100, k(p.meleeRetort.ch)) }
    if (p.onBasic) out.onBasic = { ...p.onBasic, ch: Math.min(100, k(p.onBasic.ch)) }
    if (p.lastStand) out.lastStand = { ...p.lastStand, shield: k(p.lastStand.shield) }
    if (p.enrage) out.enrage = { ...p.enrage, atk: k(p.enrage.atk) }
    if (p.afterDodge) out.afterDodge = { ...p.afterDodge, bonus: k(p.afterDodge.bonus) }
    return out
  }

  // Which skills a monster may equip: its own element plus neutral ones; at most one passive in the
  // whole loadout (the innate counts). Babies/eggs have no skills (not in the roster at all).
  const canEquip = (monster, skill, loadout) => {
    if (skill.slot === 'dodge') return true
    if (skill.el !== 'neutral' && skill.el !== monster.element) return false
    if (skill.id === monster.innate) return false
    if (skill.slot === 'passive') {
      const ids = [monster.innate, ...(loadout || [])].filter(Boolean)
      if (ids.some((id) => SKILL_BY_ID[id] && SKILL_BY_ID[id].slot === 'passive')) return false
    }
    return true
  }

  const makeFighter = (spec, team, idx, pos, tuning) => {
    // spec.custom: an adventure enemy built by enemySpec(); babies come from D.BABIES.
    const m = spec.custom || D.ROSTER[spec.monster] || D.BABIES[spec.monster]
    const gear = spec.gear || { hp: 0, atk: 0, def: 0, spd: 0 }
    const tree = spec.tree || { atk: 0, hp: 0, crit: 0 }
    // Arena-only lean per line (HP %), tuned so every element averages ~50% (see balance.js lines).
    // A lean for this line at this stage wins over the line-wide one.
    const leanOf = (key) => (tuning && tuning[key] && tuning[key].hp) || 0
    const lineHp = spec.custom ? 100 : leanOf(`line:${m.element}:${m.stage}`) || leanOf(`line:${m.element}`) || 100
    const hpMul = Math.round(((spec.hp || 100) * lineHp) / 100)
    const atkMul = spec.atk || 100
    const slots = (spec.skills || [m.innate]).filter(Boolean).map((id) => tuned(SKILL_BY_ID[id], tuning))
    const actives = slots.filter((s) => s.slot === 'active')
    const passives = slots.filter((s) => s.slot === 'passive').map((s) => s.passive)
    const passive = Object.assign({}, spec.passive || {}, ...passives)
    // The tree's healing adds to a passive skill's instead of being replaced by it.
    for (const key of ['regenPct', 'basicLifesteal']) {
      if (spec.passive && spec.passive[key]) {
        passive[key] = passives.reduce((sum, p) => sum + ((p && p[key]) || 0), spec.passive[key])
      }
    }
    const dodge = spec.dodge ? tuned(SKILL_BY_ID[spec.dodge], tuning) : null
    // Gear adds flat stats, the trainer tree scales them (as in the game's toFighter).
    const maxHp = Math.round(((m.hp + gear.hp) * (100 + tree.hp) * HP_SCALE * hpMul) / 10000)
    return {
      team,
      idx,
      m,
      name: m.name,
      emoji: m.emoji,
      el: m.element,
      atk: Math.round(((m.atk + gear.atk) * (100 + tree.atk) * atkMul) / 10000),
      def: m.def + gear.def,
      spd: m.spd + gear.spd,
      crit: tree.crit || 0,
      boss: !!spec.boss,
      eva: m.eva + (passive.eva || 0),
      acc: m.acc,
      res: m.res + (spec.resBonus || 0),
      x: pos[0] * S,
      y: pos[1] * S,
      hp: maxHp,
      maxHp,
      // A start shield has no timer: it stays until it is broken.
      shield: Math.trunc((maxHp * (passive.startShield || 0)) / 100),
      shieldT: 0,
      skills: actives,
      allSlots: slots,
      passive,
      dodge,
      baseStep: Math.trunc(((70 + m.spd * 5) * S) / TICK),
      basicCd: passive.firstStrike ? 0 : 10 + idx * 3,
      cds: actives.map((s, i) => (passive.firstStrike ? 0 : sec(1) + i * sec(1.25))),
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
      // A won dodge roll against one attack: { from, until, parry, dashAt, fromX, fromY, active, used }.
      evade: null,
      orbit: team === 0 ? 1 : -1,
      face: team === 0 ? 1 : -1,
      st: {},
      ccCount: 0,
      ccUntil: -1,
      critNext: false,
      critBonus: 0,
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

  const has = (f, st) => !!f.st[st]

  // Modifiers derived from statuses and passives, all in percent.
  const atkOf = (f) => {
    let pct = 100
    if (has(f, 'atkUp')) pct += Math.trunc((N.atkUp * f.st.atkUp.mag) / 100)
    if (has(f, 'atkDown')) pct -= N.atkDown
    if (f.passive.enrage && f.hp * 100 < f.maxHp * f.passive.enrage.belowPct) pct += f.passive.enrage.atk
    return Math.trunc((f.atk * pct) / 100)
  }
  const defOf = (f) => {
    let pct = 100
    if (has(f, 'defUp')) pct += Math.trunc((N.defUp * f.st.defUp.mag) / 100)
    if (has(f, 'defDown')) pct -= N.defDown
    return Math.trunc((f.def * pct) / 100)
  }
  // RES cuts how long a debuff lasts and the chance of a chance-based one; tenacity adds for CC.
  const resistOf = (f, cc) => Math.min(MAX_RESIST, f.res + (cc ? f.passive.tenacity || 0 : 0))
  const stepOf = (f) => {
    if (has(f, 'root')) return 0
    let pct = 100 - (f.passive.moveCut || 0)
    if (has(f, 'haste')) pct += N.hasteMove
    if (has(f, 'slow')) pct -= N.slowMove
    return Math.trunc((f.baseStep * pct) / 100)
  }
  const attackTimePct = (f) => {
    let pct = 100 - (f.passive.attackSpeed || 0)
    if (has(f, 'haste')) pct -= N.hasteAttack
    if (has(f, 'slow')) pct += N.slowAttack
    return pct
  }
  const evaOf = (f) => f.eva + (has(f, 'evaUp') ? Math.trunc((N.evaUp * f.st.evaUp.mag) / 100) : 0) - (has(f, 'evaDown') ? N.evaDown : 0)
  const isCC = (f) => has(f, 'stun')

  const simulate = (setup, seed, opts = {}) => {
    const record = !!opts.record
    const tuning = opts.tuning || null
    const rng = createRng(seed)
    const roll = (n) => rng() % n
    // A chance-based debuff lands less often against RES (a sure one always lands, shorter).
    const lands = (f, ch, st) => ch >= 100 || roll(100) < Math.trunc((ch * (100 - resistOf(f, STATUS[st].cc))) / 100)
    const fighters = []
    setup.teams.forEach((team, t) => {
      team.forEach((spec, i) => {
        const n = team.length
        const x = t === 0 ? 150 : W - 150
        const y = H / 2 + (n === 1 ? (t === 0 ? 40 : -40) : Math.round((i - (n - 1) / 2) * 110))
        fighters.push(makeFighter(spec, t, fighters.length, [x, y], tuning))
      })
    })
    const projectiles = []
    const zones = []
    const frames = []
    const events = []
    let tick = 0
    let winner = -1

    const log = (e) => {
      if (record) events.push({ t: tick, ...e })
    }
    const alive = (f) => f.hp > 0
    const enemiesOf = (f) => fighters.filter((o) => o.team !== f.team && alive(o))
    const pickTarget = (f) => {
      let best = null
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
    const addStatus = (f, st, durSec, src, extra = {}) => {
      if (!alive(f) || durSec <= 0) return
      const info = STATUS[st]
      let dur = sec(durSec)
      if (info.kind === 'debuff' && src.team !== f.team) dur = Math.trunc((dur * (100 - resistOf(f, info.cc))) / 100)
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
        f.st.poison = { t: Math.max(cur ? cur.t : 0, dur), stacks: Math.min(N.poisonMaxStacks, (cur ? cur.stacks : 0) + 1), per: Math.max(cur ? cur.per : 0, per), next: cur ? cur.next : tick + TICK, src: src.idx }
      } else if (st === 'burn') {
        const per = Math.max(1, Math.trunc((atkOf(src) * N.burnAtkPctPerSec) / 100))
        f.st.burn = { t: Math.max(cur ? cur.t : 0, dur), per: Math.max(cur ? cur.per : 0, per), next: cur ? cur.next : tick + TICK, src: src.idx }
      } else if (st === 'regen') {
        f.st.regen = { t: Math.max(cur ? cur.t : 0, dur), val: extra.val || 1, next: cur ? cur.next : tick + TICK }
      } else {
        f.st[st] = { t: Math.max(cur ? cur.t : 0, dur), mag: Math.max(cur && cur.t > 0 ? cur.mag || 100 : 0, extra.mag || 100) }
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
    const cleanse = (f, only) => {
      let n = 0
      for (const st of Object.keys(f.st)) {
        if (STATUS[st].kind !== 'debuff') continue
        if (only && !only.includes(st)) continue
        delete f.st[st]
        n++
      }
      if (f.act === ACT.STUN && !only) f.actT = 0
      if (n) log({ kind: 'cleanse', who: f.idx })
    }
    const heal = (f, amount) => {
      if (has(f, 'curse')) amount = Math.trunc((amount * (100 - N.curse)) / 100)
      const got = Math.min(f.maxHp - f.hp, Math.max(0, amount))
      f.hp += got
      f.healed += got
      return got
    }
    const giveShield = (f, pct, durSec) => {
      let amount = Math.trunc((f.maxHp * pct) / 100)
      if (has(f, 'curse')) amount = Math.trunc((amount * (100 - N.curse)) / 100)
      if (amount > f.shield) f.shield = amount
      f.shieldT = Math.max(f.shieldT, sec(durSec))
      log({ kind: 'shield', who: f.idx, amount: f.shield })
    }

    const checkLowHp = (f) => {
      const p = f.passive
      if (f.hp === 0 && p.rebirthPct && !f.rebirthUsed) {
        f.rebirthUsed = true
        f.hp = Math.max(1, Math.trunc((f.maxHp * p.rebirthPct) / 100))
        cleanse(f)
        log({ kind: 'rebirth', who: f.idx, amount: f.hp })
        return
      }
      if (p.lastStand && !f.lastStandUsed && f.hp > 0 && f.hp * 100 < f.maxHp * p.lastStand.belowPct) {
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

    // ----- damage -----
    // One hit. `power` in % of ATK; skill may carry execute/lifesteal; `melee` enables retorts.
    const hit = (a, d, power, skill, opt = {}) => {
      if (!alive(a) || !alive(d)) return
      const name = skill ? skill.name : BASIC.name
      let parried = false
      const ev = d.evade
      if (d.vanish > 0 || (ev && ev.active && ev.from === a.idx && tick <= ev.until)) {
        if (ev && ev.parry && d.vanish === 0) parried = true
        else {
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
      let elem = effectiveness(skill && skill.el && skill.el !== 'neutral' ? skill.el : a.el, d.el)
      // Adventure bosses ignore elements both ways (like the game's Boss Raid): a boss fight is a
      // close damage race, where even a x1.05 edge decided it for whole elements.
      if (a.boss || d.boss) elem = 100
      const atk = atkOf(a)
      const def = defOf(d)
      const raw = Math.floor((atk * power * elem) / 100)
      const cut = Math.min(MAX_DEF_CUT, Math.floor((def * 10000) / (def + DEFENSE_K)))
      const reduced = Math.floor((raw * (10000 - cut)) / 10000)
      const variance = VAR_MIN + roll(VAR_SPAN)
      const critRoll = roll(100)
      const crit = !a.passive.noCrit && (a.critNext || critRoll < CRIT_CHANCE + a.crit + (has(a, 'focus') ? Math.trunc((N.focusCrit * a.st.focus.mag) / 100) : 0))
      let mul = crit ? CRIT_MUL + (a.passive.critDamage || 0) : 100
      if (a.critNext) {
        mul = Math.trunc((mul * (100 + a.critBonus)) / 100)
        a.critNext = false
        a.critBonus = 0
      }
      if (skill && skill.execute && d.hp * 100 < d.maxHp * EXECUTE_BELOW) mul = Math.trunc((mul * (100 + skill.execute)) / 100)
      let dmg = Math.max(1, Math.floor((reduced * variance * mul) / DMG_SCALE))
      if (d.passive.damageCut) dmg = Math.max(1, Math.round((dmg * (100 - d.passive.damageCut)) / 100))
      if (parried) {
        dmg = Math.max(1, Math.trunc((dmg * (100 - d.dodge.dodge.parry)) / 100))
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
      // Knockback flinch on hits that don't interrupt a wind-up or a charge.
      // At most one flinch per half second, so a volley of small hits can't lock a target in place.
      if (d.act === ACT.MOVE && d.hp > 0 && tick >= d.flinchReady) {
        d.flinchReady = tick + 10
        const [kx, ky] = scaleTo(d.x - a.x, d.y - a.y, 8 * S)
        d.act = ACT.STUN
        d.actT = HITSTUN
        d.vx = Math.trunc(kx / HITSTUN)
        d.vy = Math.trunc(ky / HITSTUN)
      }
      log({ kind: 'hit', who: a.idx, target: d.idx, dmg, absorbed, crit, elem, skill: name, x: d.x, y: d.y, parried, healed })
      if (d.hp > 0 && skill && skill.fx) {
        for (const e of skill.fx) {
          if (e.to === 'self') continue
          if (lands(d, e.ch, e.st)) addStatus(d, e.st, e.dur, a, e)
        }
      }
      if (d.hp > 0 && !skill && a.passive.onBasic) {
        const ob = a.passive.onBasic
        if (lands(d, ob.ch, ob.st)) addStatus(d, ob.st, ob.dur, a)
      }
      if (opt.melee && d.passive.meleeRetort && alive(a) && dist(a, d) <= RETORT_RANGE && !opt.isRetort) {
        const r = d.passive.meleeRetort
        if (r.power > 0) hit(d, a, r.power, { name: 'สวนกลับ', el: d.el, fx: [] }, { isRetort: true })
        if (alive(a) && lands(a, r.ch, r.st)) addStatus(a, r.st, r.dur, d)
      }
      checkLowHp(d)
      checkLowHp(a)
    }

    const onDodged = (d, a) => {
      d.dodges++
      const od = d.dodge && d.dodge.dodge.onDodge
      if (od) {
        if (od.haste) addStatus(d, 'haste', od.haste, d)
        if (od.cleanse) cleanse(d)
        if (od.blindAttacker) addStatus(a, 'blind', od.blindAttacker, d)
        if (od.vanish) d.vanish = Math.max(d.vanish, sec(od.vanish))
        if (od.critNext) d.critNext = true
        if (od.counter && alive(a) && dist(a, d) <= COUNTER_RANGE) hit(d, a, od.counter, { name: d.dodge.name, el: d.el, fx: [] }, { isRetort: true })
      }
      if (d.passive.afterDodge) {
        d.critNext = true
        d.critBonus = Math.max(d.critBonus, d.passive.afterDodge.bonus || 0)
      }
    }

    // ----- dodging -----
    // Decided when the attack starts; the dash happens just before the blow lands (if still free).
    const dodgeRoll = (d, a) => {
      if (!d.dodge || d.dodgeCd > 0 || !canDash(d)) return false
      // Evasion against the attacker's accuracy; speed plays no part.
      const chance = clamp(DODGE_BASE + evaOf(d) - a.acc + d.dodge.dodge.chance, 10, DODGE_MAX)
      d.dodgeCd = sec(Math.max(DODGE_MIN_CD, d.dodge.dodge.cd - (d.passive.dodgeCdCut || 0)))
      return roll(100) < chance
    }
    // landTick: when the blow lands; 'proj' = when the projectile gets close; 'charge' = when the
    // charger gets close. A parry needs no dash; a dash must still be possible at that moment.
    const planDodge = (d, a, landTick, fromX, fromY) => {
      if (!dodgeRoll(d, a)) return
      const parry = !!d.dodge.dodge.parry
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
    const dashNow = (f, fromX, fromY, away, window) => {
      if (!canDash(f)) {
        f.evade = null
        return
      }
      startDash(f, fromX, fromY, away)
      const ev = f.evade
      ev.active = true
      ev.dashAt = null
      if (window) ev.until = tick + window
      // A dash taken against a known attack avoids it: it counts (and triggers dodge effects) now,
      // even if the blow then whiffs out of reach instead of reaching the dodger.
      ev.used = true
      log({ kind: 'dodge', who: f.idx, by: ev.from, x: f.x, y: f.y })
      onDodged(f, fighters[ev.from])
    }
    const canAct = (f) => f.act === ACT.MOVE
    // A dodge can cancel a flinch or a basic attack's wind-up, but not a stun, a seize, a skill's
    // wind-up or a charge: committing to a skill is the risk.
    const canDash = (f) =>
      alive(f) && !has(f, 'stun') && !f.seized && (f.act === ACT.MOVE || f.act === ACT.STUN || (f.act === ACT.WIND && f.kind === -1))
    const startDash = (f, fromX, fromY, away) => {
      const dx = f.x - fromX
      const dy = f.y - fromY
      let px
      let py
      const len = Math.max(stepOf(f), f.baseStep / 2) * 3
      if (away || (dx === 0 && dy === 0)) [px, py] = scaleTo(dx || 1, dy, len)
      else {
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

    // ----- attacks -----
    const fire = (me, target, skill) => {
      const n = skill.hits || 1
      const dx = target.x - me.x
      const dy = target.y - me.y
      const span = n === 1 ? 0 : 56
      planDodge(target, me, 'proj', me.x, me.y)
      for (let i = 0; i < n; i++) {
        const off = n === 1 ? 0 : Math.trunc(-span / 2 + (span * i) / (n - 1))
        const [px, py] = scaleTo(-dy, dx, Math.trunc((isqrt(dx * dx + dy * dy) * off) / 100) || 0)
        const [vx, vy] = scaleTo(dx + px, dy + py, PROJ_SPEED)
        projectiles.push({ owner: me.idx, team: me.team, x: me.x, y: me.y, vx, vy, life: 50, aim: target.idx, skill })
      }
    }

    const release = (me) => {
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
      if (sk.kind === 'melee' || sk.kind === 'multi') {
        if (d <= ((sk.range || BASIC_RANGE) + 16) * S) {
          for (let i = 0; i < (sk.hits || 1); i++) hit(me, target, sk.power, sk === BASIC ? null : sk, { melee: true })
          if (sk === BASIC && me.passive.doubleStrike && roll(100) < me.passive.doubleStrike) hit(me, target, sk.power, null, { melee: true })
        } else log({ kind: 'miss', who: me.idx, target: target.idx })
      } else if (sk.kind === 'shot' || sk.kind === 'spread') {
        fire(me, target, sk)
      } else if (sk.kind === 'burst') {
        log({ kind: 'burst', who: me.idx, x: me.x, y: me.y, r: sk.radius, el: sk.el })
        for (const o of enemiesOf(me)) if (dist(me, o) <= sk.radius * S) hit(me, o, sk.power, sk)
      } else if (sk.kind === 'beam') {
        const [ux, uy] = scaleTo(target.x - me.x, target.y - me.y, 1000)
        const len = sk.length * S
        log({ kind: 'beam', who: me.idx, x: me.x, y: me.y, x2: me.x + Math.trunc((ux * len) / 1000), y2: me.y + Math.trunc((uy * len) / 1000), w: sk.width, el: sk.el })
        for (const o of enemiesOf(me)) {
          const rx = o.x - me.x
          const ry = o.y - me.y
          const along = Math.trunc((rx * ux + ry * uy) / 1000)
          const across = Math.abs(Math.trunc((rx * uy - ry * ux) / 1000))
          if (along >= 0 && along <= len && across <= sk.width * S) hit(me, o, sk.power, sk)
        }
      } else if (sk.kind === 'zone') {
        zones.push({ owner: me.idx, team: me.team, x: target.x, y: target.y, r: sk.radius, t: sk.delay, total: sk.delay, skill: sk })
        for (const o of enemiesOf(me)) {
          if (dist(o, target) <= (sk.radius + 30) * S) planDodge(o, me, tick + sk.delay, target.x, target.y)
        }
        log({ kind: 'zone', who: me.idx, x: target.x, y: target.y, r: sk.radius, el: sk.el })
      } else if (sk.kind === 'charge') {
        const [vx, vy] = scaleTo(target.x - me.x, target.y - me.y, Math.trunc(Math.max(stepOf(me), me.baseStep / 2) * 3.5))
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
    const pickSkill = (me, target, d) => {
      if (me.gcd > 0 || has(me, 'silence')) return -1
      let best = -1
      let bestScore = 0
      const dpx = d / S
      const hpPct = Math.trunc((me.hp * 100) / me.maxHp)
      const debuffed = Object.keys(me.st).some((st) => STATUS[st].kind === 'debuff')
      const targetCC = has(target, 'stun') || has(target, 'root') || has(target, 'silence') || has(target, 'immune')
      for (let i = 0; i < me.skills.length; i++) {
        if (me.cds[i] > 0) continue
        const sk = me.skills[i]
        let score = 0
        if (sk.kind === 'self') {
          if (sk.heal) score = hpPct < 55 ? 90 : hpPct < 75 ? 30 : 0
          if (sk.cleanse && debuffed) score = Math.max(score, 75)
          if (sk.cleanseOnly && sk.cleanseOnly.some((st) => has(me, st))) score = Math.max(score, 75)
          if (sk.shield && me.shield === 0 && dpx <= 220) score = Math.max(score, 55)
          const buffs = (sk.fx || []).filter((e) => e.to === 'self')
          if (buffs.length && dpx <= 240 && buffs.some((e) => !has(me, e.st))) score = Math.max(score, 50)
        } else {
          const fits =
            ((sk.kind === 'melee' || sk.kind === 'multi') && dpx <= sk.range) ||
            (sk.kind === 'burst' && dpx <= sk.radius * 0.8) ||
            (sk.kind === 'charge' && dpx >= 80 && dpx <= 260) ||
            ((sk.kind === 'shot' || sk.kind === 'spread') && dpx >= 50 && dpx <= 320) ||
            (sk.kind === 'beam' && dpx <= sk.length * 0.85) ||
            (sk.kind === 'zone' && dpx <= 320)
          if (!fits) continue
          score = 60 + Math.trunc(((sk.power || 0) * (sk.hits || 1)) / 25)
          const cc = (sk.fx || []).some((e) => e.to !== 'self' && STATUS[e.st].cc)
          if (cc) score += targetCC ? -25 : 15
          if (sk.execute && target.hp * 100 < target.maxHp * EXECUTE_BELOW) score += 40
          if (sk.kind === 'burst' || sk.kind === 'zone') {
            const r = (sk.radius || 0) * S
            const center = sk.kind === 'burst' ? me : target
            const n = enemiesOf(me).filter((o) => dist(center, o) <= r).length
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
    const staticSeize = (me) => {
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
        f: fighters.map((me) => {
          let bits = 0
          for (const st of Object.keys(me.st)) bits |= STATUS_BIT[st]
          return [me.x, me.y, me.hp, me.act, me.kind, me.actT, me.inv || me.vanish > 0 ? 1 : 0, me.face, me.shield, bits, me.dodgeCd, ...me.cds.map((c) => Math.max(c, me.gcd))]
        }),
        p: projectiles.filter((p) => p.life > 0).map((p) => [p.x, p.y, p.team, p.skill.el || fighters[p.owner].el]),
        z: zones.filter((z) => z.t > 0).map((z) => [z.x, z.y, z.r, z.t, z.total, z.skill.el || fighters[z.owner].el]),
      })
    }

    log({ kind: 'start' })
    recordFrame()

    for (tick = 1; tick <= MAX_TICKS; tick++) {
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
        // Timers.
        if (me.basicCd > 0) me.basicCd--
        for (let i = 0; i < me.cds.length; i++) if (me.cds[i] > 0) me.cds[i]--
        if (me.dodgeCd > 0) me.dodgeCd--
        if (me.gcd > 0) me.gcd--
        if (me.vanish > 0) me.vanish--
        if (me.shieldT > 0 && --me.shieldT === 0) me.shield = 0
        for (const st of Object.keys(me.st)) {
          const s = me.st[st]
          if (!s) continue
          if ((st === 'burn' || st === 'poison') && tick >= s.next) {
            s.next = tick + TICK
            const src = fighters[s.src]
            const dmg = st === 'poison' ? s.per * s.stacks : s.per
            const lost = Math.min(me.hp, dmg)
            me.hp -= lost
            me.taken += lost
            src.dealt += lost
            log({ kind: 'dot', who: me.idx, st, dmg: lost, x: me.x, y: me.y })
            checkLowHp(me)
            if (!alive(me)) break
          }
          if (st === 'regen' && tick >= s.next) {
            s.next = tick + TICK
            const got = heal(me, Math.trunc((me.maxHp * s.val) / 100))
            if (got) log({ kind: 'regen', who: me.idx, amount: got, x: me.x, y: me.y })
          }
          if (me.st[st] === s && --s.t <= 0) delete me.st[st]
        }
        if (!alive(me)) continue
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
          if (tick > ev.until) me.evade = null
          else if (ev.dashAt === tick) dashNow(me, ev.fromX, ev.fromY, true, 0)
          else if (ev.dashAt === 'charge') {
            const charger = fighters[ev.from]
            if (charger.act === ACT.CHARGE && dist(charger, me) < 80 * S) dashNow(me, charger.x, charger.y, false, 8)
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
            const victim = enemiesOf(me).find((o) => dist(me, o) <= 40 * S)
            if (victim) {
              me.chargeHit = true
              hit(me, victim, me.skills[me.kind].power, me.skills[me.kind], { melee: true })
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
        const danger = zones.find((z) => z.team !== me.team && z.t > 0 && dist(me, z) <= (z.r + 20) * S)
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
          me.act = ACT.WIND
          me.actT = sk.wind
          me.kind = pick
          me.cds[pick] = sec(sk.cd)
          // Self skills (buffs, heals, shields) only cost half the shared skill delay.
          const delay = Math.trunc((SKILL_DELAY * attackTimePct(me)) / 100)
          me.gcd = sk.wind + (sk.kind === 'self' ? Math.trunc(delay / 2) : delay)
          me.casts++
          log({ kind: 'skill', who: me.idx, skill: sk.name, icon: sk.icon, x: me.x, y: me.y })
          if (sk.kind === 'melee' || sk.kind === 'multi') planDodge(target, me, tick + sk.wind, me.x, me.y)
          else if (sk.kind === 'burst') {
            for (const o of enemiesOf(me)) if (dist(me, o) <= (sk.radius + 30) * S) planDodge(o, me, tick + sk.wind, me.x, me.y)
          } else if (sk.kind === 'beam') planDodge(target, me, tick + sk.wind, me.x, me.y)
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
        let mx
        let my
        const wantsRoom = me.skills.some(
          (sk, i) => (sk.kind === 'shot' || sk.kind === 'spread' || sk.kind === 'charge' || sk.kind === 'zone' || sk.kind === 'beam') && Math.max(me.cds[i], me.gcd) <= 15
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
        } else [mx, my] = scaleTo(dx, dy, step)
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
            hit(fighters[p.owner], o, p.skill.power, p.skill)
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
          for (const o of fighters) if (o.team !== z.team && alive(o) && dist(o, z) <= z.r * S) hit(owner, o, z.skill.power, z.skill)
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

      const standing = [0, 1].map((t) => fighters.some((f) => f.team === t && alive(f)))
      if (!standing[0] || !standing[1]) {
        winner = standing[0] ? 0 : 1
        log({ kind: 'end', who: winner, reason: 'ko' })
        break
      }
    }
    if (winner < 0) {
      // Time up: the team with the larger share of HP left wins (integers, cross-multiplied).
      const share = [0, 1].map((t) => fighters.filter((f) => f.team === t).reduce((s, f) => [s[0] + f.hp, s[1] + f.maxHp], [0, 0]))
      winner = share[0][0] * share[1][1] >= share[1][0] * share[0][1] ? 0 : 1
      tick = MAX_TICKS
      log({ kind: 'end', who: winner, reason: 'time' })
    }

    let hash = 0x811c9dc5
    const mix = (n) => {
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
      ticks: Math.min(tick, MAX_TICKS),
      frames,
      events,
      fighters: fighters.map((f) => ({ idx: f.idx, team: f.team, name: f.name, emoji: f.emoji, el: f.el, maxHp: f.maxHp, hp: f.hp, dealt: f.dealt, taken: f.taken, healed: f.healed, dodges: f.dodges, casts: f.casts, skills: f.skills.map((s) => s.id), allSlots: f.allSlots.map((s) => s.id), dodge: f.dodge ? f.dodge.id : null, spd: f.spd, eva: f.eva, acc: f.acc, res: f.res, boss: f.boss })),
      checksum: hash.toString(16).padStart(8, '0'),
    }
  }

  // An adventure stage's enemy: the game's stage base x strength, hp/atk x the tuned `k` % (adv:<id>).
  const enemySpec = (stage, tuning) => {
    const base = D.STAGE_ALL[stage.level]
    const str = typeof stage.str === 'number' ? { hp: stage.str, atk: stage.str, def: stage.str, spd: stage.str } : stage.str
    const k = (tuning && tuning['adv:' + stage.id] && tuning['adv:' + stage.id].k) || 100
    const custom = {
      id: stage.id, name: stage.name, emoji: stage.emoji, element: stage.el, stage: stage.level,
      hp: Math.round((base.hp * str.hp * k) / 100), atk: Math.round((base.atk * str.atk * k) / 100),
      // DEF grows with the square root of k so a tougher stage is not just a bigger HP bar.
      def: Math.round(base.def * str.def * Math.sqrt(k / 100)), spd: Math.round(base.spd * str.spd),
      eva: D.LINE_EVA[stage.el], acc: D.LINE_ACC[stage.el], res: D.LINE_RES[stage.el], innate: null,
    }
    return { custom, skills: stage.skills, boss: stage.boss, resBonus: stage.boss ? D.BOSS_RES : 0 }
  }
  // A player's monster prepared like the area expects: gear grade/level and trainer tree points.
  const withPrep = (spec, prep) => ({ ...spec, gear: D.gearFlat(prep.grade, prep.level), tree: D.treeBonus(prep.tree) })

  return { enemySpec, withPrep, simulate, canEquip, effectiveness, SKILL_BY_ID, STATUS_IDS, STATUS_BIT, ACT, TICK, W, H, S, BASIC, sec, tuned, HP_SCALE, MAX_TICKS }
})()

if (typeof module !== 'undefined') module.exports = ARENA_ENGINE
