import { HttpException } from '@nestjs/common'
import { createState, DEFAULT_MAX_TICKS, GOLDEN_REPLAY, SimInput, step } from '../../libs/td-sim'
import { BATTLE_TTL_MS, COINS_PER_ROUND, COINS_WIN_BONUS } from './battle.config'
import { IBattleSession, coinsFor, evaluateFinish } from './battle'

const NOW = new Date('2026-01-01T10:00:00Z')
const session = (patch: Partial<IBattleSession> = {}): IBattleSession => ({
  id: 'b1',
  userId: 'u1',
  seed: 7,
  status: 'started',
  expiresAt: new Date(NOW.getTime() + BATTLE_TTL_MS),
  ...patch,
})
// Builds nothing and picks the first skill of every draft, so the HQ falls and the run ends 'lost'.
const losingLog = (seed: number) => {
  let state = createState(seed)
  const inputs: SimInput[] = []
  while (state.status === 'running' && state.tick < DEFAULT_MAX_TICKS) {
    const pick: SimInput[] =
      state.phase === 'draft' ? [{ tick: state.tick, type: 'pick', index: 0 }] : []
    inputs.push(...pick)
    state = step(state, pick)
  }
  return { ticks: state.tick, inputs }
}
const losing = losingLog(7)
const finish = (s: IBattleSession, req: Record<string, unknown> = {}, userId = 'u1') =>
  evaluateFinish(s, { userId, seed: 7, ...losing, ...req }, NOW)
const statusOf = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    return (e as HttpException).getStatus()
  }
  return 0
}

describe('coinsFor', () => {
  it('pays per cleared round, plus a bonus for a win', () => {
    expect(coinsFor({ status: 'lost', round: 3 })).toBe(3 * COINS_PER_ROUND)
    expect(coinsFor({ status: 'won', round: 7 })).toBe(7 * COINS_PER_ROUND + COINS_WIN_BONUS)
    expect(coinsFor({ status: 'lost', round: 0 })).toBe(0)
  })
})

describe('evaluateFinish', () => {
  it('replays the log and pays from the replayed state only', () => {
    const r = finish(session())
    expect(r.status).toBe('lost')
    expect(r.coins).toBe(coinsFor({ status: r.status, round: r.round }))
  })

  it('ignores a client-reported result, damage or reward', () => {
    const r = finish(session(), { status: 'won', coins: 999_999, round: 7, reward: 1e9 })
    expect(r.status).toBe('lost')
    expect(r.coins).toBeLessThan(999)
  })

  it('rejects a seed that is not the one issued (forged)', () => {
    expect(statusOf(() => finish(session(), { seed: 8 }))).toBe(400)
  })

  it('rejects another user as not found, without revealing the battle', () => {
    expect(statusOf(() => finish(session(), {}, 'u2'))).toBe(404)
  })

  it('rejects a reused id', () => {
    expect(statusOf(() => finish(session({ status: 'finished' })))).toBe(409)
  })

  it('rejects an expired id', () => {
    expect(statusOf(() => finish(session({ expiresAt: new Date(NOW.getTime() - 1) })))).toBe(410)
  })

  it('rejects a replay over the tick cap and malformed logs', () => {
    expect(statusOf(() => finish(session(), { ticks: DEFAULT_MAX_TICKS + 1 }))).toBe(422)
    expect(
      statusOf(() => finish(session(), { inputs: [{ tick: 0, type: 'summon', tile: 99 }] }))
    ).toBe(422)
  })

  it('rejects a log that never reaches an end', () => {
    expect(statusOf(() => finish(session(), { ...GOLDEN_REPLAY, seed: 7 }))).toBe(422)
  })

  it('is deterministic: the same log gives the same hash', () => {
    expect(finish(session()).hash).toBe(finish(session()).hash)
  })
})
