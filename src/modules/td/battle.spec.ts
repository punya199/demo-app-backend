import { HttpException } from '@nestjs/common'
import {
  createState,
  DEFAULT_MAX_TICKS,
  MAX_DRAFT_TICKS,
  MAX_REPLAY_INPUTS,
  CoreEntry,
  GOLDEN_REPLAY,
  hashState,
  PoolEntry,
  RELICS,
  RelicId,
  SimInput,
  step,
} from '../../libs/td-sim'
import { BATTLE_TTL_MS, COINS_PER_ROUND, COINS_WIN_BONUS } from './battle.config'
import { IBattleSession, coinsFor, evaluateFinish } from './battle'

const NOW = new Date('2026-01-01T10:00:00Z')
const session = (patch: Partial<IBattleSession> = {}): IBattleSession => ({
  id: 'b1',
  userId: 'u1',
  seed: 7,
  status: 'started',
  pool: null,
  cores: null,
  relics: null,
  stage: 1,
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
    expect(
      statusOf(() => finish(session(), { ticks: DEFAULT_MAX_TICKS + MAX_DRAFT_TICKS + 1 }))
    ).toBe(422)
    const flood = Array.from({ length: MAX_REPLAY_INPUTS + 1 }, () => ({
      tick: 0,
      type: 'pick' as const,
      index: 0,
    }))
    expect(statusOf(() => finish(session(), { inputs: flood }))).toBe(422)
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

describe('hero pool snapshot', () => {
  const POOL: PoolEntry[] = [{ hero: 'sun-oracle', star: 3 }]
  it('a session without a stored pool replays with the starter pool', () => {
    const log = losing
    const a = evaluateFinish(session({ pool: null }), { userId: 'u1', seed: 7, ...log }, NOW)
    const b = evaluateFinish(
      session({ pool: [...createState(7).pool] }),
      { userId: 'u1', seed: 7, ...log },
      NOW
    )
    expect(a.hash).toBe(b.hash)
  })

  it('a log made with one pool is judged by the snapshot, not by whatever the player owns later', () => {
    const log = (() => {
      let state = createState(7, POOL)
      const logged: SimInput[] = []
      while (state.status === 'running' && state.tick < DEFAULT_MAX_TICKS) {
        const now: SimInput[] =
          state.phase === 'draft'
            ? [{ tick: state.tick, type: 'pick', index: 0 }]
            : state.tick % 40 === 0 && state.tick < 400
              ? [{ tick: state.tick, type: 'summon', tile: (state.tick / 40) % 30 }]
              : []
        logged.push(...now)
        state = step(state, now)
      }
      return { ticks: state.tick, inputs: logged, hash: hashState(state) }
    })()
    const req = { userId: 'u1', seed: 7, ticks: log.ticks, inputs: log.inputs }
    expect(evaluateFinish(session({ pool: POOL }), req, NOW).hash).toBe(log.hash)
    expect(evaluateFinish(session({ pool: null }), req, NOW).hash).not.toBe(log.hash)
  })
})

describe('gear mod snapshot', () => {
  const log = (pool: PoolEntry[]) => {
    let state = createState(7, pool)
    const logged: SimInput[] = []
    while (state.status === 'running' && state.tick < DEFAULT_MAX_TICKS) {
      const now: SimInput[] =
        state.phase === 'draft'
          ? [{ tick: state.tick, type: 'pick', index: 0 }]
          : state.tick % 40 === 0 && state.tick < 400
            ? [{ tick: state.tick, type: 'summon', tile: 27 - ((state.tick / 40) % 8) }]
            : []
      logged.push(...now)
      state = step(state, now)
    }
    return { ticks: state.tick, inputs: logged, hash: hashState(state), round: state.round }
  }
  const BASE: PoolEntry[] = [{ hero: 'archer', star: 1, mod: 0 }]
  const MODDED: PoolEntry[] = [{ hero: 'archer', star: 1, mod: 5 }]

  it('the replay applies the stored mod level exactly as the client battle did', () => {
    const played = log(MODDED)
    const req = { userId: 'u1', seed: 7, ticks: played.ticks, inputs: played.inputs }
    expect(evaluateFinish(session({ pool: MODDED }), req, NOW).hash).toBe(played.hash)
  })

  it('the same log judged without the mod does not match, so a mod cannot be claimed for free', () => {
    const played = log(MODDED)
    const req = { userId: 'u1', seed: 7, ticks: played.ticks, inputs: played.inputs }
    expect(evaluateFinish(session({ pool: BASE }), req, NOW).hash).not.toBe(played.hash)
  })

  it('an upgraded hero survives at least as long as the same hero un-upgraded', () => {
    expect(log(MODDED).round).toBeGreaterThanOrEqual(log(BASE).round)
  })
})

describe('stage in the replay', () => {
  it('replays with the stage the session was started on', () => {
    const log = (stage: number) => {
      let state = createState(7, undefined, stage)
      const inputs: SimInput[] = []
      while (state.status === 'running' && state.tick < DEFAULT_MAX_TICKS) {
        const now: SimInput[] =
          state.phase === 'draft' ? [{ tick: state.tick, type: 'pick', index: 0 }] : []
        inputs.push(...now)
        state = step(state, now)
      }
      return { ticks: state.tick, inputs, hash: hashState(state) }
    }
    const stage2 = log(2)
    const req = { userId: 'u1', seed: 7, ticks: stage2.ticks, inputs: stage2.inputs }
    expect(evaluateFinish(session({ stage: 2 }), req, NOW).hash).toBe(stage2.hash)
    // the same log is not the same battle on another stage
    const other = () => evaluateFinish(session({ stage: 1 }), req, NOW).hash
    expect(statusOf(other) === 422 || other() !== stage2.hash).toBe(true)
  })

  it('reports the HQ health left and stars from the replay only', () => {
    const r = finish(session())
    expect(r.hp).toBe(0)
    expect(r.stars).toBe(0)
    const forged = finish(session(), { stars: 3, hp: 10 })
    expect(forged.stars).toBe(0)
  })
})

describe('equipped core snapshot', () => {
  const CORES: CoreEntry[] = [{ element: 'physical', rarity: 'legendary' }]
  // A bot that builds a linked chain from the source and takes the first draft offer, played with the given cores.
  const botLog = (cores: CoreEntry[]) => {
    let state = createState(7, undefined, 1, cores)
    const inputs: SimInput[] = []
    const tiles = [27, 22, 26, 28, 21, 23]
    while (state.status === 'running' && state.tick < DEFAULT_MAX_TICKS) {
      const now: SimInput[] =
        state.phase === 'draft'
          ? [{ tick: state.tick, type: 'pick', index: 0 }]
          : state.tick % 30 === 0 && state.tick / 30 < tiles.length
            ? [{ tick: state.tick, type: 'summon', tile: tiles[state.tick / 30] }]
            : []
      inputs.push(...now)
      state = step(state, now)
    }
    return { ticks: state.tick, inputs, hash: hashState(state) }
  }

  it('the server replay matches a client that played with the same cores, exactly', () => {
    const log = botLog(CORES)
    const r = evaluateFinish(session({ cores: CORES }), { userId: 'u1', seed: 7, ...log }, NOW)
    expect(r.hash).toBe(log.hash)
  })

  it('a log made with cores is not accepted as if it had none (the snapshot decides)', () => {
    const log = botLog(CORES)
    const r = evaluateFinish(session({ cores: null }), { userId: 'u1', seed: 7, ...log }, NOW)
    expect(r.hash).not.toBe(log.hash)
  })

  it('a session without stored cores (older rows) replays with none', () => {
    const log = botLog([])
    const r = evaluateFinish(session({ cores: null }), { userId: 'u1', seed: 7, ...log }, NOW)
    expect(r.hash).toBe(log.hash)
  })
})

describe('unlocked relic snapshot', () => {
  const RELIC_IDS_ON: RelicId[] = ['ember-brand']
  const POOL: PoolEntry[] = [{ hero: RELICS['ember-brand'].hero, star: 1 }]
  // A bot that builds a chain and takes the relic skill whenever a draft offers it.
  const botLog = (relics: RelicId[]) => {
    let state = createState(7, POOL, 1, [], relics)
    const inputs: SimInput[] = []
    const tiles = [27, 22, 26, 28, 21, 23]
    while (state.status === 'running' && state.tick < DEFAULT_MAX_TICKS) {
      const at = state.offer.indexOf(RELICS['ember-brand'].skill)
      const now: SimInput[] =
        state.phase === 'draft'
          ? [{ tick: state.tick, type: 'pick', index: Math.max(0, at) }]
          : state.tick % 30 === 0 && state.tick / 30 < tiles.length
            ? [{ tick: state.tick, type: 'summon', tile: tiles[state.tick / 30] }]
            : []
      inputs.push(...now)
      state = step(state, now)
    }
    return { ticks: state.tick, inputs, hash: hashState(state), skills: state.skills }
  }
  const replay = (relics: RelicId[] | null, log: ReturnType<typeof botLog>) =>
    evaluateFinish(
      session({ pool: POOL, relics }),
      { userId: 'u1', seed: 7, ticks: log.ticks, inputs: log.inputs },
      NOW
    )

  it('the server replay matches a client that played with the same relics, exactly', () => {
    const log = botLog(RELIC_IDS_ON)
    expect(log.skills).toContain(RELICS['ember-brand'].skill)
    expect(replay(RELIC_IDS_ON, log).hash).toBe(log.hash)
  })

  it('a log made with a relic is not accepted as if it had none (the snapshot decides)', () => {
    const log = botLog(RELIC_IDS_ON)
    // the draft offers differ, so the log either replays to another state or does not finish
    let hash: string | undefined
    try {
      hash = replay(null, log).hash
    } catch {
      hash = undefined
    }
    expect(hash).not.toBe(log.hash)
  })

  it('a session without stored relics (older rows) replays with none', () => {
    const log = botLog([])
    expect(replay(null, log).hash).toBe(log.hash)
  })
})
