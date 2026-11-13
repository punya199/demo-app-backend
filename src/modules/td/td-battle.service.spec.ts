import { HttpException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { createState, DEFAULT_MAX_TICKS, SimInput, step } from '../../libs/td-sim'
import { TdBattleSessionEntity } from '../../db/entities/td/td-battle-session.entity'
import { BATTLE_TTL_MS } from './battle.config'
import { TdBattleFinishDto } from './dto/td-battle-finish.dto'
import { TdBattleService } from './td-battle.service'

const NOW = new Date('2026-01-01T10:00:00Z')
const SEED = 7

const losingDto = (): TdBattleFinishDto => {
  let state = createState(SEED)
  const inputs: SimInput[] = []
  while (state.status === 'running' && state.tick < DEFAULT_MAX_TICKS) {
    const pick: SimInput[] =
      state.phase === 'draft' ? [{ tick: state.tick, type: 'pick', index: 0 }] : []
    inputs.push(...pick)
    state = step(state, pick)
  }
  return { seed: SEED, ticks: state.tick, inputs } as TdBattleFinishDto
}

// A DB-free stand-in: records the order of calls so the tests can see what ran outside the transaction.
const fake = (owner = 'u1') => {
  const events: string[] = []
  const row = {
    id: 'b1',
    userId: owner,
    seed: String(SEED),
    status: 'started',
    heroPool: null,
    cores: null,
    relics: null,
    stageId: 1,
    expiresAt: new Date(NOW.getTime() + BATTLE_TTL_MS),
  }
  const findOne = jest.fn((_e: unknown, opts: { where: { userId?: string }; lock?: unknown }) => {
    events.push(opts.lock ? 'lock-read' : 'read')
    return Promise.resolve(opts.where.userId !== owner ? null : opts.lock ? row : { ...row })
  })
  const update = jest.fn(
    (_e: unknown, criteria: unknown, patch: { status?: string; result?: string }) => {
      events.push(`update:${patch.status ?? ''}:${patch.result ?? ''}`)
      if (typeof criteria === 'object') Object.assign(row, patch)
      return Promise.resolve()
    }
  )
  const etm = {
    findOne,
    update,
    insert: jest.fn(),
    createQueryBuilder: jest.fn(() => {
      throw new Error('payout path reached')
    }),
  }
  const dataSource = {
    manager: { findOne, update },
    transaction: jest.fn((cb: (e: typeof etm) => Promise<unknown>) => {
      events.push('transaction')
      return cb(etm)
    }),
  }
  return { service: new TdBattleService(dataSource as unknown as DataSource), events, row, etm }
}

const statusOf = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e instanceof HttpException ? e.getStatus() : -1
  }
  return 0
}

describe('TdBattleService.finish', () => {
  it('looks the session up scoped to the user and without a lock, so other users get 404', async () => {
    const { service, events, etm } = fake('u1')
    expect(await statusOf(service.finish('u2', 'b1', losingDto(), NOW))).toBe(404)
    expect(events).toEqual(['read'])
    expect(etm.findOne).not.toHaveBeenCalledWith(
      TdBattleSessionEntity,
      expect.objectContaining({ lock: expect.anything() })
    )
  })

  it('replays before opening the transaction, then locks and re-checks the session', async () => {
    const { service, events } = fake()
    // the payout path is stubbed to throw; the point is the order of calls before it
    await statusOf(service.finish('u1', 'b1', losingDto(), NOW))
    expect(events.slice(0, 3)).toEqual(['read', 'transaction', 'lock-read'])
  })

  it('answers 409 when the session was finished by someone else while replaying', async () => {
    const { service, row } = fake()
    const pending = service.finish('u1', 'b1', losingDto(), NOW)
    row.status = 'finished'
    expect(await statusOf(pending)).toBe(409)
  })

  it('closes the session when the log does not finish, so it cannot be replayed again', async () => {
    const { service, events, row } = fake()
    const dto = { ...losingDto(), inputs: [], ticks: 10 } as TdBattleFinishDto
    expect(await statusOf(service.finish('u1', 'b1', dto, NOW))).toBe(422)
    expect(events).toEqual(['read', 'update:finished:invalid'])
    expect(row.status).toBe('finished')
    expect(await statusOf(service.finish('u1', 'b1', dto, NOW))).toBe(409)
  })

  it('does not close the session for a wrong seed (rejected before any replay)', async () => {
    const { service, row } = fake()
    expect(await statusOf(service.finish('u1', 'b1', { ...losingDto(), seed: 8 }, NOW))).toBe(400)
    expect(row.status).toBe('started')
  })
})
