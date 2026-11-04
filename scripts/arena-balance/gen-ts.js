// Generates the backend's arena data file from the demo's tuned data, so the numbers match exactly.
const fs = require('fs')
const D = require('./data.js')
const T = require('./tuning.json')
const strip = (o) => JSON.parse(JSON.stringify(o))
const skills = D.SKILLS.map((s) => strip(s))
const enemySkills = D.ENEMY_SKILLS.map((s) => strip(s))
const status = Object.fromEntries(Object.entries(D.STATUS).map(([k, v]) => [k, { label: v.label, icon: v.icon, kind: v.kind, ...(v.cc && { cc: true }), note: v.note }]))
const areas = D.AREAS.map((a) => ({ id: a.id, stages: a.stages.map((s) => strip(s)) }))
const tuning = Object.fromEntries(Object.entries(T).filter(([k]) => !k.startsWith('line:') || true))
const out = `// GENERATED from the Monster Arena demo (balance harness output). Edit the demo's data and
// regenerate instead of hand-editing numbers here: every value below was tuned by simulation.
import { IArenaSkill, IArenaStage, IArenaStatusInfo, StatusId } from './arena-types'

export const ARENA_STATUS: Record<StatusId, IArenaStatusInfo> = ${JSON.stringify(status, null, 2)}

export const ARENA_STATUS_NUMBERS = ${JSON.stringify(D.STATUS_NUMBERS, null, 2)}

export const ARENA_SKILLS: IArenaSkill[] = ${JSON.stringify(skills, null, 2)}

export const ARENA_ENEMY_SKILLS: IArenaSkill[] = ${JSON.stringify(enemySkills, null, 2)}

// Adventure stages by the game's stage id (adventure-data.ts keeps the legacy turn-based enemies).
export const ARENA_STAGES: Record<string, IArenaStage> = ${JSON.stringify(Object.fromEntries(areas.flatMap((a) => a.stages.map((s) => [s.id, s]))), null, 2)}

// Per-skill tuning (pow/cd/dur percent), per-line-and-stage arena HP lean ('line:<el>:<stage>' hp
// percent) and per-stage enemy strength ('adv:<stageId>' k percent).
export const ARENA_TUNING: Record<string, { pow?: number; cd?: number; dur?: number; chance?: number; hp?: number; k?: number }> = ${JSON.stringify(tuning, null, 2)}
`
fs.writeFileSync(require('path').join(__dirname, '../../src/modules/monster/arena/arena-data.ts'), out)
console.log(skills.length, enemySkills.length, Object.keys(status).length)
