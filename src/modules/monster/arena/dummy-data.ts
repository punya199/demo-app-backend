import { ARENA_BEATS } from './arena-rules'
import { ARENA_MAX_TICKS, ARENA_TICK } from './arena-rules'
import { ArenaLine, IArenaEvent, IArenaFighterSpec, IArenaResult } from './arena-types'

// Training dummy: a fight against a target that never hits back. Nothing here is saved or paid.

export const DUMMY_PRESETS = ['plain', 'raid', 'world'] as const
export const DUMMY_ELEMENTS = Object.keys(ARENA_BEATS) as ArenaLine[]
export const DUMMY_DEF_DEFAULT = 60
export const DUMMY_DEF_MAX = 500
// Far more than a monster can deal in a fight, so the fight always runs its full length.
export const DUMMY_HP = 10_000_000
export const DUMMY_FIGHT_SEC = ARENA_MAX_TICKS / ARENA_TICK

export const plainDummy = (def: number, element: ArenaLine): IArenaFighterSpec => ({
  name: 'หุ่นซ้อม',
  emoji: '🎯',
  element,
  hp: DUMMY_HP,
  atk: 0,
  def,
  spd: 1,
  eva: 0,
  acc: 0,
  res: 0,
  skills: [],
  dodge: null,
  usesElements: true,
})

// A boss's defence (DEF, element, shield, damage cut, thorns, dodge chance) with no attack:
// no skills, no ATK, no on-hit effects and no enrage.
export const asDummyOf = (boss: IArenaFighterSpec): IArenaFighterSpec => ({
  ...boss,
  hp: DUMMY_HP,
  atk: 0,
  skills: [],
  dodge: null,
  passive: { ...boss.passive, onBasic: undefined, rage: undefined, attackSpeed: undefined },
})

export interface IDummySummary {
  totalDamage: number
  seconds: number
  dps: number
  hits: number
  crits: number
  avgHit: number
  bestHit: { damage: number; skill: string | null } | null
}

// Damage the player (fighter 0) dealt, from the arena result.
export const summarizeDummyFight = (arena: IArenaResult): IDummySummary => {
  const hits = arena.events.filter((event: IArenaEvent) => event.kind === 'hit' && event.who === 0)
  const totalDamage = arena.fighters[0].dealt
  const seconds = Math.max(1, Math.min(arena.ticks, ARENA_MAX_TICKS) / ARENA_TICK)
  const best = hits.reduce<IArenaEvent | null>(
    (top, event) => ((event.dmg ?? 0) > (top?.dmg ?? 0) ? event : top),
    null
  )
  return {
    totalDamage,
    seconds,
    dps: Math.round((totalDamage / seconds) * 10) / 10,
    hits: hits.length,
    crits: hits.filter(event => event.crit).length,
    avgHit: hits.length ? Math.round((totalDamage / hits.length) * 10) / 10 : 0,
    bestHit: best ? { damage: best.dmg ?? 0, skill: best.skill ?? null } : null,
  }
}
