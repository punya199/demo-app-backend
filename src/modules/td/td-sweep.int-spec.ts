// Runs against the throwaway Postgres via `yarn test:integration` (see monster/int-test-helpers.ts).
import { HttpException } from '@nestjs/common'
import dataSource from '../../config/database.config'
import { createUser, sql, startTestDatabase, stopTestDatabase } from '../monster/int-test-helpers'
import { STAGE_ENERGY_COST } from './energy'
import { STAGE_SWEEP_REWARDS } from './stage.config'
import { TdSweepService } from './td-sweep.service'

jest.setTimeout(120_000)

const T0 = new Date('2026-01-01T10:00:00Z')

const statusOf = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return (e as HttpException).getStatus()
  }
  return 0
}

describe('td sweep', () => {
  const service = new TdSweepService(dataSource)
  const stars = (userId: string, stageId: number, n: number) =>
    sql(`INSERT INTO td.stage_progress (user_id, stage_id, stars) VALUES ($1,$2,$3)`, [
      userId,
      stageId,
      n,
    ])
  const balance = async (userId: string, currency: string) =>
    Number(
      (
        await sql<{ t: string }[]>(
          `SELECT COALESCE(SUM(amount),0) AS t FROM td.currency_ledger WHERE user_id=$1 AND currency=$2`,
          [userId, currency]
        )
      )[0].t
    )
  const setEnergy = (userId: string, energy: number) =>
    sql(
      `INSERT INTO td.player_profile (user_id, energy, energy_updated_at) VALUES ($1,$2,$3)
       ON CONFLICT (user_id) DO UPDATE SET energy=$2, energy_updated_at=$3`,
      [userId, energy, T0]
    )

  beforeAll(startTestDatabase)
  afterAll(stopTestDatabase)

  it('spends energy and pays coins and shards, never gems', async () => {
    const userId = await createUser('td')
    await stars(userId, 1, 3)
    const out = await service.sweep(userId, 1, T0)
    expect(out.coins).toBe(STAGE_SWEEP_REWARDS[0].coins)
    expect(await balance(userId, 'coins')).toBe(STAGE_SWEEP_REWARDS[0].coins)
    expect(await balance(userId, 'shards')).toBe(STAGE_SWEEP_REWARDS[0].shards)
    expect(await balance(userId, 'gems')).toBe(0)
  })

  it('rejects below 3 stars, a locked stage and too little energy, changing nothing', async () => {
    const userId = await createUser('td')
    await stars(userId, 1, 2)
    expect(await statusOf(service.sweep(userId, 1, T0))).toBe(409)
    expect(await statusOf(service.sweep(userId, 2, T0))).toBe(403)
    await stars(userId, 2, 3)
    await setEnergy(userId, STAGE_ENERGY_COST - 1)
    expect(await statusOf(service.sweep(userId, 2, T0))).toBe(409)
    expect(await balance(userId, 'coins')).toBe(0)
  })

  it('lets only as many concurrent sweeps through as energy allows', async () => {
    const userId = await createUser('td')
    await stars(userId, 1, 3)
    await setEnergy(userId, STAGE_ENERGY_COST * 2)
    const codes = await Promise.all([1, 2, 3, 4].map(() => statusOf(service.sweep(userId, 1, T0))))
    expect(codes.filter(c => c === 0)).toHaveLength(2)
    expect(await balance(userId, 'coins')).toBe(STAGE_SWEEP_REWARDS[0].coins * 2)
  })
})
