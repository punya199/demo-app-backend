import { ARENA_ENEMY_SKILLS, ARENA_SKILLS, ARENA_STATUS, ARENA_STATUS_NUMBERS } from '../arena-data'
import { ARENA_H, ARENA_SCALE, ARENA_TICK, ARENA_W } from '../arena-rules'
import { IArenaSkill, StatusId } from '../arena-types'

export const N = ARENA_STATUS_NUMBERS
export const TICK = ARENA_TICK
export const S = ARENA_SCALE
export const W = ARENA_W
export const H = ARENA_H
export const MARGIN = 36
export const PROJ_SPEED = 13 * S
export const PROJ_HIT = 26 * S
export const BASIC_CD = 24
export const BASIC_WIND = 7
export const BASIC_RANGE = 54
export const DASH_TICKS = 5
export const HITSTUN = 4
export const MIN_GAP = 34 * S
export const DEFENSE_K = 40
export const MAX_DEF_CUT = 7500
export const VAR_MIN = 80
export const VAR_SPAN = 41
export const DMG_SCALE = 1000000
export const RETORT_RANGE = 90 * S
export const COUNTER_RANGE = 160 * S

export const STATUS_IDS = Object.keys(ARENA_STATUS) as StatusId[]
export const STATUS_BIT = Object.fromEntries(STATUS_IDS.map((id, i) => [id, 1 << i])) as Record<
  StatusId,
  number
>
export const ARENA_SKILL_BY_ID: Record<string, IArenaSkill> = Object.fromEntries(
  [...ARENA_SKILLS, ...ARENA_ENEMY_SKILLS].map(skill => [skill.id, skill])
)

export const ACT = { MOVE: 0, WIND: 1, DODGE: 2, STUN: 3, CHARGE: 4 }
export const BASIC: IArenaSkill = {
  id: 'basic',
  name: 'โจมตี',
  icon: '👊',
  el: 'neutral',
  src: '',
  slot: 'active',
  kind: 'melee',
  cd: 0,
  power: 100,
  hits: 1,
  range: BASIC_RANGE,
  wind: BASIC_WIND,
}

export const sec = (x: number) => Math.round(x * TICK)

export const createRng = (seed: number) => {
  let value = seed >>> 0
  return () => {
    value = (value + 0x6d2b79f5) >>> 0
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (t ^ (t >>> 14)) >>> 0
  }
}
export const isqrt = (n: number) => {
  if (n < 2) {
    return n
  }
  let x = n
  let y = Math.floor((x + 1) / 2)
  while (y < x) {
    x = y
    y = Math.floor((x + Math.floor(n / x)) / 2)
  }
  return x
}
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
export const scaleTo = (dx: number, dy: number, len: number): [number, number] => {
  const d = isqrt(dx * dx + dy * dy) || 1
  return [Math.trunc((dx * len) / d), Math.trunc((dy * len) / d)]
}
export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return isqrt(dx * dx + dy * dy)
}
