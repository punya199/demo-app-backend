// Balance harness: runs leagues of mirrored fights on all cores and tunes skills toward 50%.
//   node balance.js report            -> report with current tuning.json
//   node balance.js tune <rounds>     -> iterate tuning, write tuning.json
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads')
const fs = require('fs')
const path = require('path')

if (!isMainThread) {
  const E = require('./engine.js')
  parentPort.on('message', ({ jobs, tuning }) => {
    const out = jobs.map((j) => {
      const r = E.simulate(j.setup, j.seed, { tuning })
      return { w: r.winner, t: r.ticks, tag: j.tag, side: j.side }
    })
    parentPort.postMessage(out)
  })
  return
}

const D = require('./data.js')
const E = require('./engine.js')
const TUNING_FILE = path.join(__dirname, 'tuning.json')
const CORES = 4

const workers = Array.from({ length: CORES }, () => new Worker(__filename))
const runJobs = async (jobs, tuning) => {
  const chunk = Math.ceil(jobs.length / CORES)
  const parts = await Promise.all(
    workers.map(
      (w, i) =>
        new Promise((resolve) => {
          w.once('message', resolve)
          w.postMessage({ jobs: jobs.slice(i * chunk, (i + 1) * chunk), tuning })
        })
    )
  )
  return parts.flat()
}

// Deterministic pseudo-random for picking partners.
let lcg = 12345
const rand = (n) => {
  lcg = (Math.imul(lcg, 1103515245) + 12345) >>> 0
  return lcg % n
}

const LINES = ['flame', 'tide', 'leaf', 'earth', 'lightning', 'holy', 'dark', 'shadow']
const STAGES = { adult: ['adultGood', 'adultPoor', 'adultAlt'], perfect: ['perfectGood', 'perfectPoor', 'perfectAlt'], ultimate: ['ultimate', 'ultimateAlt'] }
const AOE = new Set(['burst', 'zone', 'spread', 'beam'])
const DODGES = D.SKILLS.filter((s) => s.slot === 'dodge').map((s) => s.id)

const poolFor = (el) => D.SKILLS.filter((s) => (s.slot === 'active' || s.slot === 'passive') && (s.el === el || s.el === 'neutral'))

// Skill league: same host both sides, same partner skill, X vs Y in one slot.
const skillJobs = (seeds) => {
  const jobs = []
  for (const el of LINES) {
    const hosts = [...STAGES.adult, ...STAGES.perfect].map((f) => D.ROSTER[`${el}_${f}`])
    for (const host of hosts) {
      const pool = poolFor(el).filter((s) => E.canEquip(host, s, []))
      for (let i = 0; i < pool.length; i++) {
        for (let j = i + 1; j < pool.length; j++) {
          const X = pool[i]
          const Y = pool[j]
          for (let s = 0; s < seeds; s++) {
            const partners = pool.filter((z) => z !== X && z !== Y && z.slot === 'active')
            const Z = partners[rand(partners.length)]
            const dodge = DODGES[rand(DODGES.length)]
            const swap = s % 2 === 1
            const a = { monster: host.id, skills: [host.innate, X.id, Z.id], dodge }
            const b = { monster: host.id, skills: [host.innate, Y.id, Z.id], dodge }
            jobs.push({ setup: { teams: swap ? [[b], [a]] : [[a], [b]] }, seed: 1000 + jobs.length, tag: swap ? [Y.id, X.id] : [X.id, Y.id] })
          }
        }
      }
    }
  }
  return jobs
}

// Dodge league.
const dodgeJobs = (seeds) => {
  const jobs = []
  for (const el of LINES) {
    for (const f of [...STAGES.adult, ...STAGES.perfect]) {
      const host = D.ROSTER[`${el}_${f}`]
      const pool = poolFor(el).filter((s) => s.slot === 'active' && E.canEquip(host, s, []))
      for (let i = 0; i < DODGES.length; i++) {
        for (let j = i + 1; j < DODGES.length; j++) {
          for (let s = 0; s < seeds; s++) {
            const p1 = pool[rand(pool.length)]
            let p2 = pool[rand(pool.length)]
            if (p2 === p1) p2 = pool[(pool.indexOf(p1) + 1) % pool.length]
            const swap = s % 2 === 1
            const a = { monster: host.id, skills: [host.innate, p1.id, p2.id], dodge: DODGES[i] }
            const b = { monster: host.id, skills: [host.innate, p1.id, p2.id], dodge: DODGES[j] }
            jobs.push({ setup: { teams: swap ? [[b], [a]] : [[a], [b]] }, seed: 5000 + jobs.length, tag: swap ? [DODGES[j], DODGES[i]] : [DODGES[i], DODGES[j]] })
          }
        }
      }
    }
  }
  return jobs
}

// Random legal loadout for a monster.
const randomLoadout = (m) => {
  const pool = poolFor(m.element).filter((s) => E.canEquip(m, s, []))
  const a = pool[rand(pool.length)]
  const rest = pool.filter((s) => s !== a && E.canEquip(m, s, [a.id]))
  const b = rest[rand(rest.length)]
  return { monster: m.id, skills: [m.innate, a.id, b.id], dodge: DODGES[rand(DODGES.length)] }
}

// Monster league within a stage: random loadouts, every pair.
const monsterJobs = (stage, seeds) => {
  const jobs = []
  const ms = LINES.flatMap((el) => STAGES[stage].map((f) => D.ROSTER[`${el}_${f}`]))
  for (let i = 0; i < ms.length; i++) {
    for (let j = i + 1; j < ms.length; j++) {
      for (let s = 0; s < seeds; s++) {
        const swap = s % 2 === 1
        const a = randomLoadout(ms[i])
        const b = randomLoadout(ms[j])
        jobs.push({ setup: { teams: swap ? [[b], [a]] : [[a], [b]] }, seed: 9000 + jobs.length, tag: swap ? [ms[j].id, ms[i].id] : [ms[i].id, ms[j].id] })
      }
    }
  }
  return jobs
}

// Pack clears: each AOE/single skill on adult hosts against every pack.
const packJobs = (seeds) => {
  const jobs = []
  for (const el of LINES) {
    for (const f of STAGES.adult) {
      const host = D.ROSTER[`${el}_${f}`]
      const pool = poolFor(el).filter((s) => s.slot === 'active' && E.canEquip(host, s, []))
      for (const X of pool) {
        for (const p of D.PACKS) {
          for (let s = 0; s < seeds; s++) {
            const partners = pool.filter((z) => z !== X)
            const Z = partners[rand(partners.length)]
            const enemies = Array.from({ length: p.count }, () => ({ monster: p.base, skills: p.skills, hp: p.hp.adult, atk: p.atk }))
            jobs.push({ setup: { teams: [[{ monster: host.id, skills: [host.innate, X.id, Z.id], dodge: 'dg_step' }], enemies] }, seed: 20000 + jobs.length, tag: [X.id] })
          }
        }
      }
    }
  }
  return jobs
}

// Field league: a host with skill X (or dodge D) against random same-stage opponents of every line.
// Catches what mirrors cannot: a skill that is strong because of who uses it or who it meets.
const fieldJobs = (fights) => {
  const jobs = []
  for (const stage of Object.keys(STAGES)) {
    const field = LINES.flatMap((x) => STAGES[stage].map((g) => D.ROSTER[`${x}_${g}`]))
    for (const el of LINES) {
      for (const f of STAGES[stage]) {
        const m = D.ROSTER[`${el}_${f}`]
        const pool = poolFor(el).filter((s) => E.canEquip(m, s, []))
        const push = (lo, tag, k) => {
          const opp = randomLoadout(field[rand(field.length)])
          const swap = k % 2 === 1
          jobs.push({ setup: { teams: swap ? [[opp], [lo]] : [[lo], [opp]] }, seed: 60000 + jobs.length, tag: [tag], side: swap ? 1 : 0 })
        }
        for (const X of pool) {
          for (let k = 0; k < fights; k++) {
            const rest = pool.filter((z) => z !== X && E.canEquip(m, z, [X.id]))
            push({ monster: m.id, skills: [m.innate, X.id, rest[rand(rest.length)].id], dodge: DODGES[rand(DODGES.length)] }, `${X.id}@${el}`, k)
          }
        }
        for (let k = 0; k < fights * 2; k++) {
          const lo = randomLoadout(m)
          push({ ...lo, dodge: DODGES[k % DODGES.length] }, `${DODGES[k % DODGES.length]}@${el}`, k)
        }
        for (let k = 0; k < fights * 8; k++) push(randomLoadout(m), `line:${el}:${stage}`, k)
      }
    }
  }
  return jobs
}
// Field skill score relative to its own line: wr(skill@line) - average of that line's entries + 50,
// averaged over the lines that use it. Removes "this line is strong" from "this skill is strong".
const relative = (fd) => {
  const byLine = {}
  for (const [k, v] of Object.entries(fd)) {
    if (!k.includes('@')) continue
    const [id, el] = k.split('@')
    const kind = E.SKILL_BY_ID[id].slot === 'dodge' ? 'd' : 's'
    ;(byLine[el + kind] = byLine[el + kind] || []).push([id, v.wr, v.n])
  }
  const acc = {}
  for (const rows of Object.values(byLine)) {
    const avg = rows.reduce((s, r) => s + r[1], 0) / rows.length
    for (const [id, wr, n] of rows) {
      const a = (acc[id] = acc[id] || { sum: 0, k: 0, n: 0 })
      a.sum += wr - avg + 50
      a.k++
      a.n += n
    }
  }
  return Object.fromEntries(Object.entries(acc).map(([id, a]) => [id, { wr: a.sum / a.k, n: a.n, sec: 0 }]))
}
const tally1 = (results) => {
  const by = {}
  for (const r of results) {
    const v = (by[r.tag[0]] = by[r.tag[0]] || { w: 0, n: 0, t: 0 })
    v.n++
    v.t += r.t
    if (r.w === r.side) v.w++
  }
  return Object.fromEntries(Object.entries(by).map(([k, v]) => [k, { wr: (100 * v.w) / v.n, n: v.n, sec: v.t / v.n / 20 }]))
}

const tally = (results) => {
  const score = {}
  for (const r of results) {
    const [a, b] = r.tag
    for (const id of [a, b]) score[id] = score[id] || { w: 0, n: 0, t: 0 }
    score[a].n++
    score[b].n++
    score[a].t += r.t
    score[b].t += r.t
    if (r.w === 0) score[a].w++
    else score[b].w++
  }
  return Object.fromEntries(Object.entries(score).map(([k, v]) => [k, { wr: (100 * v.w) / v.n, n: v.n, sec: v.t / v.n / 20 }]))
}

const loadTuning = () => (fs.existsSync(TUNING_FILE) ? JSON.parse(fs.readFileSync(TUNING_FILE, 'utf8')) : {})

const targetOf = (s) => (AOE.has(s.kind) ? 47 : 50)

const step = (tuning, scores, gain) => {
  const next = { ...tuning }
  for (const [id, sc] of Object.entries(scores)) {
    const s = E.SKILL_BY_ID[id]
    const dev = sc.wr - targetOf(s)
    if (Math.abs(dev) < 1.5) continue
    const t = { ...(next[id] || {}) }
    const k = clamp(1 - dev * gain, 0.75, 1.3)
    if (s.slot === 'dodge') t.cd = clamp(Math.round((t.cd || 100) / k), 50, 220)
    else {
      // Strength first; once it hits a bound, the cooldown takes over.
      const pow = Math.round((t.pow || 100) * k)
      t.pow = clamp(pow, s.slot === "passive" ? 15 : 35, 300)
      if (pow !== t.pow) t.cd = clamp(Math.round((t.cd || 100) / k), 45, 220)
    }
    next[id] = t
  }
  return next
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

const printScores = (title, scores, extra = () => '') => {
  console.log(`\n== ${title}`)
  const rows = Object.entries(scores).sort((a, b) => b[1].wr - a[1].wr)
  for (const [id, sc] of rows) {
    const s = E.SKILL_BY_ID[id] || D.ROSTER[id]
    console.log(`${sc.wr.toFixed(1).padStart(5)}%  ${String(sc.sec.toFixed(1)).padStart(4)}s  ${id.padEnd(16)} ${(s && s.name) || ''} ${extra(id)}`)
  }
}

const spread = (scores) => {
  const v = Object.values(scores).map((s) => s.wr)
  return { min: Math.min(...v).toFixed(1), max: Math.max(...v).toFixed(1), sd: Math.sqrt(v.reduce((a, x) => a + (x - 50) ** 2, 0) / v.length).toFixed(2) }
}

const main = async () => {
  const mode = process.argv[2] || 'report'
  let tuning = loadTuning()
  if (mode === 'tune') {
    const rounds = Number(process.argv[3] || 4)
    for (let r = 0; r < rounds; r++) {
      const gain = r < 2 ? 0.014 : 0.009
      const sk = tally(await runJobs(skillJobs(6), tuning))
      const dg = tally(await runJobs(dodgeJobs(4), tuning))
      console.log(`round ${r + 1}: skills ${JSON.stringify(spread(sk))} dodges ${JSON.stringify(spread(dg))}`)
      tuning = step(step(tuning, sk, gain), dg, gain)
      fs.writeFileSync(TUNING_FILE, JSON.stringify(tuning, null, 1))
    }
  }
  if (mode === 'tune2') {
    // Mirror and field scores averaged per skill/dodge; per-stage line HP from the field.
    const rounds = Number(process.argv[3] || 4)
    for (let r = 0; r < rounds; r++) {
      const gain = r < 2 ? 0.012 : 0.008
      const sk = tally(await runJobs(skillJobs(5), tuning))
      const dg = tally(await runJobs(dodgeJobs(3), tuning))
      const raw = tally1(await runJobs(fieldJobs(12), tuning))
      const fd = { ...relative(raw), ...Object.fromEntries(Object.entries(raw).filter(([k]) => k.startsWith('line:'))) }
      const blend = (m) => Object.fromEntries(Object.entries(m).map(([id, v]) => [id, { ...v, wr: fd[id] ? (v.wr + fd[id].wr) / 2 : v.wr }]))
      const bsk = blend(sk)
      const bdg = blend(dg)
      const lines = Object.entries(fd).filter(([k]) => k.startsWith('line:'))
      console.log(`round ${r + 1}: skills ${JSON.stringify(spread(bsk))} dodges ${JSON.stringify(spread(bdg))} lines ${JSON.stringify(spread(Object.fromEntries(lines)))}`)
      tuning = step(step(tuning, bsk, gain), bdg, gain)
      for (const [key, v] of lines) {
        const cur = (tuning[key] || tuning[key.split(':').slice(0, 2).join(':')] || {}).hp || 100
        tuning = { ...tuning, [key]: { hp: clamp(Math.round(cur * clamp(1 - (v.wr - 50) * 0.005, 0.94, 1.06)), 70, 140) } }
      }
      fs.writeFileSync(TUNING_FILE, JSON.stringify(tuning, null, 1))
    }
    const raw = tally1(await runJobs(fieldJobs(24), tuning))
    const fd = { ...relative(raw), ...Object.fromEntries(Object.entries(raw).filter(([k]) => k.startsWith('line:'))) }
    fs.writeFileSync(path.join(__dirname, 'field-report.json'), JSON.stringify(fd))
    printScores('field league (vs every line)', fd, (id) => (tuning[id] ? JSON.stringify(tuning[id]) : ''))
    console.log('spread skills', spread(Object.fromEntries(Object.entries(fd).filter(([k]) => !k.startsWith('line:')))))
  }
  if (mode === 'report' || mode === 'tune') {
    const sk = tally(await runJobs(skillJobs(10), tuning))
    printScores('skills (mirror league)', sk, (id) => {
      const t = tuning[id]
      return t ? JSON.stringify(t) : ''
    })
    console.log('spread', spread(sk))
    const dg = tally(await runJobs(dodgeJobs(6), tuning))
    printScores('dodge skills', dg, (id) => (tuning[id] ? JSON.stringify(tuning[id]) : ''))
    console.log('spread', spread(dg))
  }
  if (mode === 'lines') {
    const rounds = Number(process.argv[3] || 5)
    for (let r = 0; r <= rounds; r++) {
      const byLine = {}
      for (const stage of ['adult', 'perfect', 'ultimate']) {
        const ms = tally(await runJobs(monsterJobs(stage, 10), tuning))
        for (const [id, sc] of Object.entries(ms)) {
          const l = id.split('_')[0]
          byLine[l] = byLine[l] || []
          byLine[l].push(sc.wr)
        }
      }
      const avg = Object.fromEntries(Object.entries(byLine).map(([l, v]) => [l, v.reduce((a, b) => a + b) / v.length]))
      console.log(`lines round ${r}:`, JSON.stringify(Object.fromEntries(Object.entries(avg).map(([l, v]) => [l, v.toFixed(1) + ' hp' + ((tuning['line:' + l] || {}).hp || 100)]))))
      if (r === rounds) break
      for (const [l, v] of Object.entries(avg)) {
        const key = 'line:' + l
        const cur = (tuning[key] || {}).hp || 100
        const k = clamp(1 - (v - 50) * 0.008, 0.85, 1.15)
        tuning = { ...tuning, [key]: { hp: clamp(Math.round(cur * k), 70, 140) } }
      }
      fs.writeFileSync(TUNING_FILE, JSON.stringify(tuning, null, 1))
    }
  }
  if (mode === 'monsters' || mode === 'all') {
    for (const stage of ['adult', 'perfect', 'ultimate']) {
      const ms = tally(await runJobs(monsterJobs(stage, 16), tuning))
      printScores(`monsters ${stage}`, ms)
      const byLine = {}
      for (const [id, sc] of Object.entries(ms)) {
        const l = id.split('_')[0]
        byLine[l] = byLine[l] || []
        byLine[l].push(sc.wr)
      }
      console.log('by line', Object.fromEntries(Object.entries(byLine).map(([l, v]) => [l, (v.reduce((a, b) => a + b) / v.length).toFixed(1)])))
    }
  }
  if (mode === 'element' || mode === 'all') {
    // Strong-element matchups: same stage, random loadouts.
    let w = 0
    let n = 0
    const jobs = []
    for (const stage of ['adult', 'perfect']) {
      for (const a of LINES)
        for (const b of LINES) {
          if (!(D.BEATS[a] || []).includes(b)) continue
          for (const fa of STAGES[stage])
            for (const fb of STAGES[stage])
              for (let s = 0; s < 6; s++) jobs.push({ setup: { teams: s % 2 ? [[randomLoadout(D.ROSTER[`${b}_${fb}`])], [randomLoadout(D.ROSTER[`${a}_${fa}`])]] : [[randomLoadout(D.ROSTER[`${a}_${fa}`])], [randomLoadout(D.ROSTER[`${b}_${fb}`])]] }, seed: 40000 + jobs.length, tag: s % 2 ? ['weak', 'strong'] : ['strong', 'weak'] })
        }
    }
    const t = tally(await runJobs(jobs, tuning))
    console.log('\n== element advantage', t)
  }
  if (mode === 'packs' || mode === 'all') {
    const res = await runJobs(packJobs(6), tuning)
    const by = {}
    for (const r of res) {
      const id = r.tag[0]
      by[id] = by[id] || { w: 0, n: 0, t: 0 }
      by[id].n++
      by[id].t += r.t
      if (r.w === 0) by[id].w++
    }
    console.log('\n== pack clears (adult hosts)')
    const rows = Object.entries(by).map(([id, v]) => [id, (100 * v.w) / v.n, v.t / v.n / 20]).sort((a, b) => b[1] - a[1])
    for (const [id, wr, s] of rows) console.log(`${wr.toFixed(1).padStart(5)}%  ${s.toFixed(1)}s  ${id.padEnd(16)} ${E.SKILL_BY_ID[id].kind}`)
    const aoe = rows.filter((r) => AOE.has(E.SKILL_BY_ID[r[0]].kind))
    const single = rows.filter((r) => !AOE.has(E.SKILL_BY_ID[r[0]].kind))
    const avg = (rs) => (rs.reduce((a, r) => a + r[1], 0) / rs.length).toFixed(1)
    console.log('AOE avg', avg(aoe), 'single avg', avg(single))
  }
  await Promise.all(workers.map((w) => w.terminate()))
}
main()
