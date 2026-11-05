// Best-loadout check: for each form, sample legal loadouts, play each against a random field of
// same-stage opponents, report per line: random-loadout average and the best loadouts' win rate.
const { Worker, isMainThread, parentPort } = require('worker_threads')
if (!isMainThread) {
  const E = require('./engine.js')
  parentPort.on('message', ({ jobs, tuning }) => parentPort.postMessage(jobs.map((j) => ({ w: E.simulate(j.setup, j.seed, { tuning }).winner, tag: j.tag, a: j.a }))))
  return
}
const fs = require('fs')
const D = require('./data.js'), E = require('./engine.js')
const tuning = JSON.parse(fs.readFileSync(process.argv[2] || './tuning.json', 'utf8'))
const LINES = ['flame','tide','leaf','earth','lightning','holy','dark','shadow']
const ST = { adult: ['adultGood','adultPoor','adultAlt'], perfect: ['perfectGood','perfectPoor','perfectAlt'], ultimate: ['ultimate','ultimateAlt'] }
const DG = D.SKILLS.filter((s) => s.slot === 'dodge').map((s) => s.id)
let l = 4242
const rnd = (n) => { l = (Math.imul(l, 1103515245) + 12345) >>> 0; return (l >>> 8) % n }
const loadouts = (m) => {
  const pool = D.SKILLS.filter((s) => (s.slot === 'active' || s.slot === 'passive') && E.canEquip(m, s, []))
  const out = []
  for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
    if (!E.canEquip(m, pool[j], [pool[i].id])) continue
    for (const d of DG) out.push({ monster: m.id, skills: [m.innate, pool[i].id, pool[j].id], dodge: d })
  }
  return out
}
const randomOf = (m) => { const all = loadouts(m); return all[rnd(all.length)] }
const SAMPLE = Number(process.argv[3] || 90), FIGHTS = Number(process.argv[4] || 16)
const jobs = []
for (const stage of Object.keys(ST)) {
  const field = LINES.flatMap((x) => ST[stage].map((f) => D.ROSTER[`${x}_${f}`]))
  for (const line of LINES) for (const f of ST[stage]) {
    const m = D.ROSTER[`${line}_${f}`]
    const all = loadouts(m)
    for (let k = 0; k < SAMPLE; k++) {
      const lo = all[rnd(all.length)]
      for (let s = 0; s < FIGHTS; s++) {
        const opp = randomOf(field[rnd(field.length)])
        jobs.push({ setup: { teams: s % 2 ? [[opp], [lo]] : [[lo], [opp]] }, seed: 70000 + jobs.length, tag: `${stage}|${m.id}|${lo.skills.slice(1).join('+')}+${lo.dodge}`, a: s % 2 ? 1 : 0 })
      }
    }
  }
}
const workers = Array.from({ length: 4 }, () => new Worker(__filename))
const chunk = Math.ceil(jobs.length / 4)
Promise.all(workers.map((w, i) => new Promise((res) => { w.once('message', res); w.postMessage({ jobs: jobs.slice(i * chunk, (i + 1) * chunk), tuning }) }))).then((parts) => {
  const by = {}
  for (const r of parts.flat()) { const v = (by[r.tag] = by[r.tag] || { w: 0, n: 0 }); v.n++; if (r.w === r.a) v.w++ }
  const lines = {}
  for (const [tag, v] of Object.entries(by)) {
    const [stage, mid] = tag.split('|'); const line = mid.split('_')[0]
    const key = `${stage}|${line}`
    ;(lines[key] = lines[key] || []).push({ tag, wr: (100 * v.w) / v.n })
  }
  const rows = []
  for (const [key, list] of Object.entries(lines)) {
    list.sort((a, b) => b.wr - a.wr)
    const avg = list.reduce((s, x) => s + x.wr, 0) / list.length
    const top = list.slice(0, Math.ceil(list.length * 0.1))
    rows.push([key, avg, top.reduce((s, x) => s + x.wr, 0) / top.length, list[0]])
  }
  rows.sort((a, b) => a[0].localeCompare(b[0]))
  for (const [key, avg, top, best] of rows) console.log(key.padEnd(18), 'avg', avg.toFixed(1), 'top10%', top.toFixed(1), 'best', best.wr.toFixed(0), best.tag.split('|').slice(1).join(' '))
  const sh = Object.entries(lines).filter(([k]) => k.endsWith('shadow')).flatMap(([, v]) => v).sort((a, b) => b.wr - a.wr).slice(0, 12)
  console.log('\nshadow top loadouts'); for (const x of sh) console.log(x.wr.toFixed(0).padStart(4), x.tag)
  workers.forEach((w) => w.terminate())
})
