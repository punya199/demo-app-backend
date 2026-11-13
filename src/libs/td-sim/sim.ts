import { linkedTiles, outputOf, touchingSides } from './board'
import {
  BOSS_CALL_COUNT,
  BOSS_CALL_EVERY,
  BOSS_ROUND,
  BOSS_SHIELD_DAMAGE_PCT,
  BOSS_SHIELD_EVERY,
  BOSS_SHIELD_TICKS,
  BOSS_WEAK_DAMAGE_PCT,
  BOSS_WEAK_HERO,
  CHARGE_BASE,
  CHARGE_PER_SIDE,
  CHARGE_SCALE,
  CRIT_OUTPUT_PCT,
  DRAFT_SIZE,
  ENEMIES,
  ENEMY_BASE_HP,
  HEROES,
  HP_GROWTH_PCT,
  INCOME_EVERY,
  LANE_LENGTH,
  MAX_CRIT_PCT,
  MAX_GEAR_MOD,
  MAX_LEVEL,
  MAX_STAR,
  ROUNDS,
  SKILL_BANK_GOLD,
  SKILL_BOUNTY,
  SKILL_CRIT_PCT,
  SKILL_HASTE_PCT,
  SKILL_IDS,
  SKILL_POWER_PCT,
  SKILL_REPAIR_HP,
  STARTER_POOL,
  START_GOLD,
  START_HP,
  STRONG_SKILL_COOLDOWN_PCT,
  STRONG_SKILL_STAR,
  SUMMON_COST,
  TILE_COUNT,
  type EnemyKind,
  type HeroId,
  type SkillId,
} from './config'
import { createRng } from './rng'

/** Fixed timestep: one tick is 50 ms of game time. Rendering interpolates; the sim never reads a clock. */
export const TICK_MS = 50
/** Server-side ceiling on replay length (about 10 minutes of game time). */
export const DEFAULT_MAX_TICKS = 12_000

export type SimInput =
  | { tick: number; type: 'summon'; tile: number }
  /** Merge the gear on `from` into the identical gear on `to`. */
  | { tick: number; type: 'merge'; from: number; to: number }
  /** Take the `index`-th skill of the current draft offer. */
  | { tick: number; type: 'pick'; index: number }

export interface Gear {
  tile: number
  hero: HeroId
  /** 1 to MAX_STAR, copied from the battle's pool; merging keeps it. */
  star: number
  /** 0 to MAX_GEAR_MOD, copied from the battle's pool; merging keeps it. Missing means 0. */
  mod?: number
  /** 1 to MAX_LEVEL; merging two identical gears gives level + 1. */
  level: number
  /** Charge units still needed before the next shot (hero.cooldown * CHARGE_SCALE when empty). Only linked gears charge. */
  cooldown: number
}

/** One owned hero as the battle sees it. */
export interface PoolEntry {
  hero: HeroId
  star: number
  /** Gear mod level 0 to MAX_GEAR_MOD; omitted means 0. */
  mod?: number
}

/** Charge units a gear needs for a shot; the stronger skill (from STRONG_SKILL_STAR) reloads faster. */
export const fullCooldown = (hero: HeroId, star: number): number =>
  Math.floor(
    (HEROES[hero].cooldown *
      CHARGE_SCALE *
      (star >= STRONG_SKILL_STAR ? STRONG_SKILL_COOLDOWN_PCT : 100)) /
      100
  )

export interface Enemy {
  id: number
  kind: EnemyKind
  /** Lane-units walked, 0 to LANE_LENGTH. */
  pos: number
  hp: number
}

export interface SimState {
  tick: number
  rng: number
  gold: number
  hp: number
  status: 'running' | 'lost' | 'won'
  /** Enemies spawned over the whole run; the next enemy id. */
  spawned: number
  /** 0 to BOSS_ROUND. */
  round: number
  /** 'draft': the round is over and the player picks a skill; the world is frozen until they do. */
  phase: 'fight' | 'draft'
  /** Ticks since the round started, and enemies of this round spawned so far. */
  roundTick: number
  roundSpawned: number
  offer: SkillId[]
  /** Skills picked so far; a skill picked twice stacks. */
  skills: SkillId[]
  enemies: Enemy[]
  gears: Gear[]
  /** The summon pool, snapshotted when the battle starts; never changes during a run. */
  pool: PoolEntry[]
}

export interface Replay {
  seed: number
  ticks: number
  inputs: SimInput[]
  /** Owned-hero snapshot taken at battle start; omitted means the starter pool. */
  pool?: PoolEntry[]
}

export function createState(seed: number, pool: readonly PoolEntry[] = STARTER_POOL): SimState {
  return {
    tick: 0,
    rng: seed >>> 0,
    gold: START_GOLD,
    hp: START_HP,
    status: 'running',
    spawned: 0,
    round: 0,
    phase: 'fight',
    roundTick: 0,
    roundSpawned: 0,
    offer: [],
    skills: [],
    enemies: [],
    gears: [],
    pool: pool.map((p) => ({ ...p })),
  }
}

const stacks = (skills: readonly SkillId[], id: SkillId) => skills.filter((k) => k === id).length

function scaledHp(kind: EnemyKind, round: number): number {
  const base = (ENEMY_BASE_HP * ENEMIES[kind].hpPct) / 100
  return Math.max(1, Math.floor((base * (100 + HP_GROWTH_PCT * round)) / 100))
}

/** Damage one hit deals to an enemy after the boss's weakness and shield, then armor (a hit always does at least 1). */
function hitDamage(raw: number, hero: HeroId, target: Enemy, roundTick: number): number {
  let dmg = raw
  if (target.kind === 'boss') {
    if (hero === BOSS_WEAK_HERO) dmg = Math.floor((dmg * BOSS_WEAK_DAMAGE_PCT) / 100)
    if (roundTick % BOSS_SHIELD_EVERY < BOSS_SHIELD_TICKS)
      dmg = Math.floor((dmg * BOSS_SHIELD_DAMAGE_PCT) / 100)
  }
  return Math.max(1, dmg - ENEMIES[target.kind].armor)
}

/** A draw of DRAFT_SIZE distinct skills (partial Fisher-Yates on the seeded rng). */
function drawOffer(rng: ReturnType<typeof createRng>): SkillId[] {
  const pool = [...SKILL_IDS]
  for (let i = 0; i < DRAFT_SIZE; i++) {
    const j = i + rng.int(pool.length - i)
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, DRAFT_SIZE)
}

function stepDraft(state: SimState, inputs: readonly SimInput[]): SimState {
  const pick = inputs.find(
    (i) =>
      i.type === 'pick' && Number.isInteger(i.index) && i.index >= 0 && i.index < state.offer.length
  )
  const tick = state.tick + 1
  if (!pick || pick.type !== 'pick') return { ...state, tick }
  const skill = state.offer[pick.index]
  return {
    ...state,
    tick,
    gold: state.gold + (skill === 'bank' ? SKILL_BANK_GOLD : 0),
    hp: Math.min(START_HP, state.hp + (skill === 'repair' ? SKILL_REPAIR_HP : 0)),
    phase: 'fight',
    round: state.round + 1,
    roundTick: 0,
    roundSpawned: 0,
    offer: [],
    skills: [...state.skills, skill],
  }
}

/** Advance one tick, applying the inputs stamped with the current tick. */
export function step(state: SimState, inputs: readonly SimInput[]): SimState {
  if (state.status !== 'running') return state
  if (state.phase === 'draft') return stepDraft(state, inputs)
  const rng = createRng(0, state.rng)
  let gold = state.gold
  const gears = [...state.gears]
  const onBoard = (t: unknown): t is number =>
    Number.isInteger(t) && (t as number) >= 0 && (t as number) < TILE_COUNT
  for (const input of inputs) {
    if (input.type === 'pick') continue
    if (input.type === 'merge') {
      const from = gears.findIndex((g) => g.tile === input.from)
      const to = gears.findIndex((g) => g.tile === input.to)
      if (from < 0 || to < 0 || from === to) continue
      const a = gears[from]
      const b = gears[to]
      if (a.hero !== b.hero || a.level !== b.level || a.level >= MAX_LEVEL) continue
      gears[to] = { ...b, level: b.level + 1, cooldown: fullCooldown(b.hero, b.star) }
      gears.splice(from, 1)
      continue
    }
    const free = onBoard(input.tile) && !gears.some((g) => g.tile === input.tile)
    if (!free || gold < SUMMON_COST) continue
    gold -= SUMMON_COST
    const { hero, star, mod } = state.pool[rng.int(state.pool.length)]
    gears.push({
      tile: input.tile,
      hero,
      star,
      mod: mod ?? 0,
      level: 1,
      cooldown: fullCooldown(hero, star),
    })
  }
  if (state.tick % INCOME_EVERY === 0) gold += 1

  const plan = ROUNDS[state.round]
  const roundTick = state.roundTick
  let spawned = state.spawned
  let roundSpawned = state.roundSpawned
  let enemies = state.enemies.map((e) => ({ ...e }))
  const spawn = (kind: EnemyKind) =>
    enemies.push({ id: spawned++, kind, pos: 0, hp: scaledHp(kind, state.round) })
  if (roundSpawned < plan.enemies.length && roundTick % plan.every === 0) {
    spawn(plan.enemies[roundSpawned++])
  }
  // boss skill: while it lives it calls grunts at the start of the lane
  if (
    roundTick > 0 &&
    roundTick % BOSS_CALL_EVERY === 0 &&
    enemies.some((e) => e.kind === 'boss')
  ) {
    for (let i = 0; i < BOSS_CALL_COUNT; i++) spawn('grunt')
  }

  // ponytail: gears reach the whole lane and always hit the front-most enemy; range and targeting rules come later.
  const firing = gears.map((g) => ({ ...g }))
  const linked = linkedTiles(firing)
  const powerPct = 100 + SKILL_POWER_PCT * stacks(state.skills, 'power')
  const hastePct = 100 + SKILL_HASTE_PCT * stacks(state.skills, 'haste')
  const critBonus = SKILL_CRIT_PCT * stacks(state.skills, 'crit')
  const bounty = SKILL_BOUNTY * stacks(state.skills, 'bounty')
  for (const gear of firing) {
    if (!linked.has(gear.tile)) continue
    if (gear.cooldown > 0) {
      const gain = CHARGE_BASE + CHARGE_PER_SIDE * touchingSides(gear.tile, firing)
      gear.cooldown = Math.max(0, gear.cooldown - Math.floor((gain * hastePct) / 100))
      continue
    }
    let target: Enemy | undefined
    for (const e of enemies) if (!target || e.pos > target.pos) target = e
    if (!target) continue
    const out = outputOf(gear, firing)
    const critPct = Math.min(MAX_CRIT_PCT, out.critPct + critBonus)
    const crit = critPct > 0 && rng.int(100) < critPct
    let raw = Math.max(1, Math.floor((out.damage * powerPct) / 100))
    if (crit) raw = Math.floor((raw * CRIT_OUTPUT_PCT) / 100)
    target.hp -= hitDamage(raw, gear.hero, target, roundTick)
    gear.cooldown = fullCooldown(gear.hero, gear.star)
    if (target.hp <= 0) {
      gold += ENEMIES[target.kind].reward + bounty
      enemies = enemies.filter((e) => e !== target)
    }
  }

  enemies = enemies.map((e) => ({ ...e, pos: e.pos + ENEMIES[e.kind].speed }))
  let leaked = 0
  for (const e of enemies) if (e.pos >= LANE_LENGTH) leaked += ENEMIES[e.kind].leak
  enemies = enemies.filter((e) => e.pos < LANE_LENGTH)
  const hp = Math.max(0, state.hp - leaked)

  const roundDone = roundSpawned >= plan.enemies.length && !enemies.some((e) => e.kind === 'boss')
  const cleared = roundDone && (state.round === BOSS_ROUND || enemies.length === 0)
  const status = hp === 0 ? 'lost' : cleared && state.round === BOSS_ROUND ? 'won' : 'running'
  const drafting = status === 'running' && cleared
  const offer = drafting ? drawOffer(rng) : state.offer

  return {
    ...state,
    tick: state.tick + 1,
    rng: rng.state(),
    gold,
    hp,
    status,
    spawned,
    phase: drafting ? 'draft' : 'fight',
    roundTick: roundTick + 1,
    roundSpawned,
    offer,
    enemies,
    gears: firing,
  }
}

function assertValidPool(pool: unknown): void {
  if (!Array.isArray(pool) || pool.length === 0) throw new RangeError('pool must not be empty')
  for (const p of pool as Partial<PoolEntry>[]) {
    if (typeof p?.hero !== 'string' || !Object.prototype.hasOwnProperty.call(HEROES, p.hero))
      throw new RangeError('pool has an unknown hero')
    if (!Number.isInteger(p.star) || p.star! < 1 || p.star! > MAX_STAR)
      throw new RangeError('pool star must be an integer from 1 to MAX_STAR')
    if (p.mod !== undefined && (!Number.isInteger(p.mod) || p.mod < 0 || p.mod > MAX_GEAR_MOD))
      throw new RangeError('pool mod must be an integer from 0 to MAX_GEAR_MOD')
  }
}

function assertValidReplay(replay: Replay, maxTicks: number): void {
  const { seed, ticks, inputs } = replay
  if (replay.pool !== undefined) assertValidPool(replay.pool)
  if (!Number.isInteger(seed)) throw new RangeError('seed must be an integer')
  if (!Number.isInteger(ticks) || ticks < 0 || ticks > maxTicks) {
    throw new RangeError(`ticks must be an integer in [0, ${maxTicks}]`)
  }
  let prev = 0
  for (const input of inputs) {
    if (input?.type !== 'summon' && input?.type !== 'merge' && input?.type !== 'pick')
      throw new RangeError('unknown input type')
    if (!Number.isInteger(input.tick) || input.tick < prev || input.tick >= ticks) {
      throw new RangeError('input ticks must be integers, in order, and within the replay')
    }
    if (input.type === 'pick') {
      if (!Number.isInteger(input.index) || input.index < 0 || input.index >= DRAFT_SIZE)
        throw new RangeError('pick index must be a draft slot')
      prev = input.tick
      continue
    }
    const tiles = input.type === 'summon' ? [input.tile] : [input.from, input.to]
    if (!tiles.every((t) => Number.isInteger(t) && t >= 0 && t < TILE_COUNT)) {
      throw new RangeError('input tiles must be integers on the board')
    }
    prev = input.tick
  }
}

/** Replay a battle from its seed and input log. Throws RangeError on a malformed or over-long log. */
export function runReplay(replay: Replay, opts: { maxTicks?: number } = {}): SimState {
  assertValidReplay(replay, opts.maxTicks ?? DEFAULT_MAX_TICKS)
  let state = createState(replay.seed, replay.pool)
  let i = 0
  while (state.tick < replay.ticks && state.status === 'running') {
    const now: SimInput[] = []
    while (i < replay.inputs.length && replay.inputs[i].tick === state.tick)
      now.push(replay.inputs[i++])
    state = step(state, now)
  }
  return state
}

/** FNV-1a over a fixed-order string form of the state: a cheap, engine-independent fingerprint. */
export function hashState(state: SimState): string {
  const text = JSON.stringify([
    state.tick,
    state.rng,
    state.gold,
    state.hp,
    state.status,
    state.spawned,
    state.round,
    state.phase,
    state.roundTick,
    state.roundSpawned,
    state.offer,
    state.skills,
    state.enemies.map((e) => [e.id, e.kind, e.pos, e.hp]),
    state.gears.map((g) => [g.tile, g.hero, g.star, g.mod ?? 0, g.level, g.cooldown]),
    state.pool.map((p) => [p.hero, p.star, p.mod ?? 0]),
  ])
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
