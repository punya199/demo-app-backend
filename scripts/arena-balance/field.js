// Field league: for a line's hosts, each slot skill / dodge vs a random same-stage field.
const { Worker, isMainThread, parentPort } = require('worker_threads')
if (!isMainThread) { const E = require('./engine.js'); parentPort.on('message', ({ jobs, tuning }) => parentPort.postMessage(jobs.map((j) => ({ w: E.simulate(j.setup, j.seed, { tuning }).winner, tag: j.tag, a: j.a })))); return }
const D = require('./data.js'), E = require('./engine.js'), fs = require('fs')
const tuning = JSON.parse(fs.readFileSync(process.argv[3] || './tuning.json', 'utf8'))
const lines = (process.argv[2] || 'shadow').split(',')
const ALL = ['flame','tide','leaf','earth','lightning','holy','dark','shadow']
const ST = { adult: ['adultGood','adultPoor','adultAlt'], perfect: ['perfectGood','perfectPoor','perfectAlt'], ultimate: ['ultimate','ultimateAlt'] }
const DG = D.SKILLS.filter((s) => s.slot === 'dodge').map((s) => s.id)
let l = 99; const rnd = (n) => { l = (Math.imul(l, 1103515245) + 12345) >>> 0; return (l >>> 8) % n }
const rlo = (m) => { const pool = D.SKILLS.filter((s) => (s.slot==='active'||s.slot==='passive') && E.canEquip(m, s, [])); const a = pool[rnd(pool.length)]; const rest = pool.filter((s) => s !== a && E.canEquip(m, s, [a.id])); return { monster: m.id, skills: [m.innate, a.id, rest[rnd(rest.length)].id], dodge: DG[rnd(8)] } }
const jobs = []
for (const line of lines) for (const stage of Object.keys(ST)) for (const f of ST[stage]) {
  const m = D.ROSTER[`${line}_${f}`]
  const field = ALL.flatMap((x) => ST[stage].map((g) => D.ROSTER[`${x}_${g}`]))
  const pool = D.SKILLS.filter((s) => (s.slot==='active'||s.slot==='passive') && E.canEquip(m, s, []))
  for (const X of pool) for (let s = 0; s < 24; s++) {
    const rest = pool.filter((z) => z !== X && E.canEquip(m, z, [X.id])); const Z = rest[rnd(rest.length)]
    const lo = { monster: m.id, skills: [m.innate, X.id, Z.id], dodge: DG[rnd(8)] }
    const opp = rlo(field[rnd(field.length)])
    jobs.push({ setup: { teams: s % 2 ? [[opp], [lo]] : [[lo], [opp]] }, seed: 1e5 + jobs.length, tag: `${line}|skill|${X.id}`, a: s % 2 })
    const lo2 = { ...rlo(m), dodge: DG[s % 8] }
    jobs.push({ setup: { teams: s % 2 ? [[opp], [lo2]] : [[lo2], [opp]] }, seed: 2e5 + jobs.length, tag: `${line}|dodge|${lo2.dodge}`, a: s % 2 })
    jobs.push({ setup: { teams: s % 2 ? [[opp], [lo2]] : [[lo2], [opp]] }, seed: 3e5 + jobs.length, tag: `${line}|line|${stage}`, a: s % 2 })
  }
}
const workers = Array.from({ length: 4 }, () => new Worker(__filename)); const chunk = Math.ceil(jobs.length / 4)
Promise.all(workers.map((w, i) => new Promise((res) => { w.once('message', res); w.postMessage({ jobs: jobs.slice(i * chunk, (i + 1) * chunk), tuning }) }))).then((parts) => {
  const by = {}; for (const r of parts.flat()) { const v = (by[r.tag] = by[r.tag] || { w: 0, n: 0 }); v.n++; if (r.w === r.a) v.w++ }
  const rows = Object.entries(by).map(([t, v]) => [t, (100 * v.w) / v.n, v.n]).sort((a, b) => a[0].split('|').slice(0, 2).join().localeCompare(b[0].split('|').slice(0, 2).join()) || b[1] - a[1])
  for (const [t, wr, n] of rows) console.log(wr.toFixed(1).padStart(5) + '%', String(n).padStart(5), t, (E.SKILL_BY_ID[t.split('|')[2]] || {}).name || '')
  workers.forEach((w) => w.terminate())
})
