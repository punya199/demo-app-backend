import { createRng } from './rng'

/** Fixed timestep: one tick is 50 ms of game time. Rendering interpolates; the sim never reads a clock. */
export const TICK_MS = 50
/** Server-side ceiling on replay length (about 10 minutes of game time). */
export const DEFAULT_MAX_TICKS = 12_000

// ponytail: placeholder world (income + spend) to prove the tick loop; battle rules replace it in ticket 02.
export interface SimInput {
  tick: number
  type: 'spend'
  amount: number
}

export interface SimState {
  tick: number
  rng: number
  gold: number
}

export interface Replay {
  seed: number
  ticks: number
  inputs: SimInput[]
}

export function createState(seed: number): SimState {
  return { tick: 0, rng: seed >>> 0, gold: 0 }
}

/** Advance one tick, applying the inputs stamped with the current tick. */
export function step(state: SimState, inputs: readonly SimInput[]): SimState {
  const rng = createRng(0, state.rng)
  let gold = state.gold + 1 + rng.int(3)
  for (const input of inputs) {
    if (input.amount <= gold) gold -= input.amount
  }
  return { tick: state.tick + 1, rng: rng.state(), gold }
}

function assertValidReplay(replay: Replay, maxTicks: number): void {
  const { seed, ticks, inputs } = replay
  if (!Number.isInteger(seed)) throw new RangeError('seed must be an integer')
  if (!Number.isInteger(ticks) || ticks < 0 || ticks > maxTicks) {
    throw new RangeError(`ticks must be an integer in [0, ${maxTicks}]`)
  }
  let prev = 0
  for (const input of inputs) {
    if (input?.type !== 'spend') throw new RangeError('unknown input type')
    if (!Number.isInteger(input.tick) || input.tick < prev || input.tick >= ticks) {
      throw new RangeError('input ticks must be integers, in order, and within the replay')
    }
    if (!Number.isInteger(input.amount) || input.amount < 0) {
      throw new RangeError('spend amount must be a non-negative integer')
    }
    prev = input.tick
  }
}

/** Replay a battle from its seed and input log. Throws RangeError on a malformed or over-long log. */
export function runReplay(replay: Replay, opts: { maxTicks?: number } = {}): SimState {
  assertValidReplay(replay, opts.maxTicks ?? DEFAULT_MAX_TICKS)
  let state = createState(replay.seed)
  let i = 0
  while (state.tick < replay.ticks) {
    const now: SimInput[] = []
    while (i < replay.inputs.length && replay.inputs[i].tick === state.tick)
      now.push(replay.inputs[i++])
    state = step(state, now)
  }
  return state
}

/** FNV-1a over a fixed-order string form of the state: a cheap, engine-independent fingerprint. */
export function hashState(state: SimState): string {
  const text = `${state.tick}|${state.rng}|${state.gold}`
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
