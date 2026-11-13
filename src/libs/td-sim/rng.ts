/** Seeded PRNG (mulberry32). Integer math only, so results are identical on every JS engine. */
export interface Rng {
  /** Next unsigned 32-bit integer. */
  nextU32(): number
  /** Integer in [0, n). */
  int(n: number): number
  /** Serialisable state; pass it back as `createRng(0, state)` to resume. */
  state(): number
}

export function createRng(seed: number, resumeState?: number): Rng {
  let s = (resumeState ?? seed) >>> 0
  const nextU32 = (): number => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (t ^ (t >>> 14)) >>> 0
  }
  return {
    nextU32,
    int(n) {
      if (!Number.isInteger(n) || n <= 0) throw new RangeError('int(n) needs a positive integer')
      return Math.floor((nextU32() / 4294967296) * n)
    },
    state: () => s,
  }
}
