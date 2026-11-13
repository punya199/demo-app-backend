// Runs against the throwaway Postgres via `yarn test:integration` (see monster/int-test-helpers.ts).
import { HttpException } from '@nestjs/common'
import dataSource from '../../config/database.config'
import { AddTdBattleSession1794800000000 } from '../../db/migrations/1794800000000-add-td-battle-session'
import { createState, DEFAULT_MAX_TICKS, SimInput, step } from '../../libs/td-sim'
import { createUser, sql, startTestDatabase, stopTestDatabase } from '../monster/int-test-helpers'
import { BATTLE_TTL_MS } from './battle.config'
import { STAGE_ENERGY_COST, ENERGY_CAP } from './energy'
import { TdBattleFinishDto } from './dto/td-battle-finish.dto'
import { TdBattleService } from './td-battle.service'

jest.setTimeout(120_000)

const T0 = new Date('2026-01-01T10:00:00Z')

// A log that builds nothing and picks the first skill of every draft: the run ends 'lost'.
const losingLog = (seed: number): TdBattleFinishDto => {
  let state = createState(seed)
  const inputs: SimInput[] = []
  while (state.status === 'running' && state.tick < DEFAULT_MAX_TICKS) {
    const pick: SimInput[] =
      state.phase === 'draft' ? [{ tick: state.tick, type: 'pick', index: 0 }] : []
    inputs.push(...pick)
    state = step(state, pick)
  }
  return { seed, ticks: state.tick, inputs } as TdBattleFinishDto
}

const statusOf = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return (e as HttpException).getStatus()
  }
  return 0
}

describe('td battle', () => {
  const service = new TdBattleService(dataSource)
  const coinsOf = async (userId: string) =>
    Number(
      (
        await sql<{ t: string }[]>(
          `SELECT COALESCE(SUM(amount),0) t FROM td.currency_ledger WHERE user_id=$1 AND currency='coins'`,
          [userId]
        )
      )[0].t
    )
  const energyOf = async (userId: string) =>
    (
      await sql<{ energy: number }[]>(`SELECT energy FROM td.player_profile WHERE user_id=$1`, [
        userId,
      ])
    )[0].energy

  beforeAll(startTestDatabase)
  afterAll(stopTestDatabase)

  it('keeps battle_session in the td schema and can be reverted and applied again', async () => {
    const tables = await sql<{ table_schema: string }[]>(
      `SELECT table_schema FROM information_schema.tables WHERE table_name = 'battle_session'`
    )
    expect(tables.map(t => t.table_schema)).toEqual(['td'])
    const migration = new AddTdBattleSession1794800000000()
    const queryRunner = dataSource.createQueryRunner()
    try {
      await migration.down(queryRunner)
      expect(
        await sql(`SELECT 1 FROM information_schema.tables WHERE table_name='battle_session'`)
      ).toHaveLength(0)
    } finally {
      await migration.up(queryRunner)
      await queryRunner.release()
    }
  })

  it('start spends energy and returns a seed and an id that expires', async () => {
    const userId = await createUser('td')
    const { battleId, seed, expiresAt } = await service.start(userId, T0)
    expect(battleId).toMatch(/^[0-9a-f-]{36}$/)
    expect(Number.isInteger(seed)).toBe(true)
    expect(expiresAt.getTime()).toBe(T0.getTime() + BATTLE_TTL_MS)
    expect(await energyOf(userId)).toBe(ENERGY_CAP - STAGE_ENERGY_COST)
  })

  it('refuses to start without enough energy, and charges nothing', async () => {
    const userId = await createUser('td')
    await service.start(userId, T0)
    await sql(`UPDATE td.player_profile SET energy = 1 WHERE user_id=$1`, [userId])
    expect(await statusOf(service.start(userId, T0))).toBe(409)
    expect(await energyOf(userId)).toBe(1)
  })

  it('finish pays coins from the replayed result through the ledger, once', async () => {
    const userId = await createUser('td')
    const { battleId, seed } = await service.start(userId, T0)
    const dto = losingLog(seed)
    const res = await service.finish(userId, battleId, dto, new Date(T0.getTime() + 60_000))
    expect(res.result).toBe('lost')
    expect(res.balances.coins).toBe(await coinsOf(userId))
    expect(await coinsOf(userId)).toBe(res.coins)
    // reused id
    expect(await statusOf(service.finish(userId, battleId, dto, T0))).toBe(409)
    expect(await coinsOf(userId)).toBe(res.coins)
  })

  it('rejects a forged finish: wrong seed, tampered log, and client-reported rewards change nothing', async () => {
    const userId = await createUser('td')
    const { battleId, seed } = await service.start(userId, T0)
    const good = losingLog(seed)
    // forged seed
    expect(await statusOf(service.finish(userId, battleId, { ...good, seed: seed ^ 1 }, T0))).toBe(
      400
    )
    // tampered log: a log that never ends the battle
    expect(
      await statusOf(service.finish(userId, battleId, { ...good, inputs: [], ticks: 10 }, T0))
    ).toBe(422)
    // over the tick cap
    expect(
      await statusOf(
        service.finish(userId, battleId, { ...good, ticks: DEFAULT_MAX_TICKS + 1 }, T0)
      )
    ).toBe(422)
    expect(await coinsOf(userId)).toBe(0)
    // extra client-claimed fields are ignored: the paid amount is the replayed one
    const forged = { ...good, result: 'won', coins: 999_999 } as unknown as TdBattleFinishDto
    const res = await service.finish(userId, battleId, forged, T0)
    expect(res.result).toBe('lost')
    expect(res.coins).toBeLessThan(999)
    expect(await coinsOf(userId)).toBe(res.coins)
  })

  it('rejects another user and an expired battle, paying nothing', async () => {
    const owner = await createUser('td')
    const other = await createUser('td')
    const { battleId, seed } = await service.start(owner, T0)
    const dto = losingLog(seed)
    expect(await statusOf(service.finish(other, battleId, dto, T0))).toBe(404)
    const late = new Date(T0.getTime() + BATTLE_TTL_MS + 1)
    expect(await statusOf(service.finish(owner, battleId, dto, late))).toBe(410)
    expect(await coinsOf(owner)).toBe(0)
    expect(await coinsOf(other)).toBe(0)
  })

  it('two parallel finishes of one battle pay once', async () => {
    const userId = await createUser('td')
    const { battleId, seed } = await service.start(userId, T0)
    const dto = losingLog(seed)
    const results = await Promise.allSettled([
      service.finish(userId, battleId, dto, T0),
      service.finish(userId, battleId, dto, T0),
    ])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const [{ n }] = await sql<{ n: string }[]>(
      `SELECT count(*) n FROM td.currency_ledger WHERE user_id=$1 AND reason = $2`,
      [userId, `td_battle:${battleId}`]
    )
    expect(Number(n)).toBeLessThanOrEqual(1)
  })
})
