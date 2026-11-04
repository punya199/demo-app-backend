// Adventure tuning: each stage's hp/atk scale `k` is searched so the area's benchmark monster
// (every line, every form of the area's stage, random legal loadout, the area's gear and tree)
// wins the target share of fights.  node advtune.js [tune|report]
const fs = require('fs')
const D = require('./data.js'), E = require('./engine.js')
const FILE = './tuning.json'
let tuning = JSON.parse(fs.readFileSync(FILE, 'utf8'))
const LINES = ['flame','tide','leaf','earth','lightning','holy','dark','shadow']
const FORMS = { baby2: ['baby2'], adult: ['adultGood','adultPoor','adultAlt'], perfect: ['perfectGood','perfectPoor','perfectAlt'], ultimate: ['ultimate','ultimateAlt'] }
const DG = D.SKILLS.filter((s) => s.slot === 'dodge').map((s) => s.id)
let l = 777
const rnd = (n) => { l = (Math.imul(l, 1103515245) + 12345) >>> 0; return (l >>> 8) % n }
const loadout = (m) => {
  if (!m.innate) return { monster: m.id, skills: [], dodge: null }
  const pool = D.SKILLS.filter((s) => (s.slot === 'active' || s.slot === 'passive') && E.canEquip(m, s, []))
  const a = pool[rnd(pool.length)]
  const rest = pool.filter((s) => s !== a && E.canEquip(m, s, [a.id]))
  return { monster: m.id, skills: [m.innate, a.id, rest[rnd(rest.length)].id], dodge: DG[rnd(DG.length)] }
}
const population = (prep) => LINES.flatMap((x) => FORMS[prep.stage].map((f) => D.ROSTER[`${x}_${f}`] || D.BABIES[`${x}_${f}`]))
const rate = (area, stage, seeds, loadoutOf = loadout) => {
  const enemy = E.enemySpec(stage, tuning)
  let w = 0, n = 0, t = 0
  for (const m of population(area.prep)) for (let s = 0; s < seeds; s++) {
    const r = E.simulate({ teams: [[E.withPrep(loadoutOf(m), area.prep)], [enemy]] }, 5000 + n * 7 + s, { tuning })
    w += r.winner === 0; t += r.ticks; n++
  }
  return { wr: (100 * w) / n, sec: t / n / 20 }
}
const mode = process.argv[2] || 'tune'
if (mode === 'tune') {
  D.AREAS.forEach((area, ai) => {
    for (const st of area.stages) {
      const target = st.boss ? D.ADVENTURE_TARGETS.boss[ai] : D.ADVENTURE_TARGETS.normal[ai]
      let lo = 20, hi = 900
      for (let it = 0; it < 9; it++) {
        const mid = Math.round((lo + hi) / 2)
        tuning['adv:' + st.id] = { k: mid }
        if (rate(area, st, 16).wr > target) lo = mid; else hi = mid
      }
      tuning['adv:' + st.id] = { k: Math.round((lo + hi) / 2) }
      fs.writeFileSync(FILE, JSON.stringify(tuning, null, 1))
    }
  })
}
if (mode === 'refine') {
  // Nudge k from a large measurement: 1 point of win rate ~ 1% of k.
  for (let pass = 0; pass < 1; pass++) D.AREAS.forEach((area, ai) => {
    for (const st of area.stages) {
      const target = st.boss ? D.ADVENTURE_TARGETS.boss[ai] : D.ADVENTURE_TARGETS.normal[ai]
      const got = rate(area, st, 30).wr
      const k = tuning['adv:' + st.id].k
      tuning['adv:' + st.id] = { k: Math.max(20, Math.round(k * (1 + (got - target) * 0.0025))) }
    }
    fs.writeFileSync(FILE, JSON.stringify(tuning, null, 1))
  })
}
const report = {}
D.AREAS.forEach((area, ai) => {
  for (const st of area.stages) {
    const target = st.boss ? D.ADVENTURE_TARGETS.boss[ai] : D.ADVENTURE_TARGETS.normal[ai]
    const r = rate(area, st, 30)
    const e = E.enemySpec(st, tuning).custom
    report[st.id] = { wr: Math.round(r.wr * 10) / 10, target, sec: Math.round(r.sec * 10) / 10 }
    console.log(st.id.padEnd(13), `target ${target}%`.padEnd(11), `got ${r.wr.toFixed(1)}%`.padEnd(11), `${r.sec.toFixed(1)}s`.padEnd(7), `k ${tuning['adv:' + st.id].k}`.padEnd(7), `hp ${e.hp} atk ${e.atk} def ${e.def} spd ${e.spd}`)
  }
})
fs.writeFileSync('./adv-report.json', JSON.stringify(report))
