const D = require('./data.js'), E = require('./engine.js'), T = require('./tuning.json')
const LINES = ['flame','tide','leaf','earth','lightning','holy','dark','shadow']
const DG = D.SKILLS.filter((s) => s.slot === 'dodge').map((s) => s.id)
const area = D.AREAS[4], boss = area.stages[3], enemy = E.enemySpec(boss, T)
let l = 31; const rnd = (n) => { l = (Math.imul(l, 1103515245) + 12345) >>> 0; return (l >>> 8) % n }
const rows = []
for (const x of LINES) for (const f of ['ultimate', 'ultimateAlt']) {
  const m = D.ROSTER[`${x}_${f}`]
  const pool = D.SKILLS.filter((s) => (s.slot === 'active' || s.slot === 'passive') && E.canEquip(m, s, []))
  const res = []
  for (let k = 0; k < 60; k++) {
    const a = pool[rnd(pool.length)]; const rest = pool.filter((s) => s !== a && E.canEquip(m, s, [a.id]))
    const lo = { monster: m.id, skills: [m.innate, a.id, rest[rnd(rest.length)].id], dodge: DG[rnd(8)] }
    let w = 0; for (let s = 0; s < 12; s++) w += E.simulate({ teams: [[E.withPrep(lo, area.prep)], [enemy]] }, 900 + s * 13 + k, { tuning: T }).winner === 0
    res.push([(100 * w) / 12, lo])
  }
  res.sort((p, q) => q[0] - p[0])
  // Re-check the 3 best with more fights (sampling 12 fights favours lucky loadouts).
  const top = res.slice(0, 3).map(([, lo]) => { let w = 0; for (let s = 0; s < 60; s++) w += E.simulate({ teams: [[E.withPrep(lo, area.prep)], [enemy]] }, 77000 + s, { tuning: T }).winner === 0; return [(100 * w) / 60, lo] }).sort((p, q) => q[0] - p[0])
  const avg = res.reduce((s, r) => s + r[0], 0) / res.length
  rows.push([m.id, avg, top[0][0], top[0][1].skills.slice(1).join('+') + '+' + top[0][1].dodge])
}
rows.sort((a, b) => b[2] - a[2])
for (const r of rows) console.log(r[0].padEnd(22), 'avg', r[1].toFixed(0).padStart(3) + '%', ' best', r[2].toFixed(0).padStart(3) + '%', r[3])
console.log('overall avg', (rows.reduce((s, r) => s + r[1], 0) / rows.length).toFixed(1), 'avg of best', (rows.reduce((s, r) => s + r[2], 0) / rows.length).toFixed(1))
