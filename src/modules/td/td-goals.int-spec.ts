// Runs against the throwaway Postgres via `yarn test:integration` (see monster/int-test-helpers.ts).
import { AddTdGoalClaim1795200000000 } from '../../db/migrations/1795200000000-add-td-goal-claim'
import dataSource from '../../config/database.config'
import { createUser, sql, startTestDatabase, stopTestDatabase } from '../monster/int-test-helpers'
import { TdGoalsService } from './td-goals.service'

jest.setTimeout(120_000)

const worked = (p: Promise<unknown>) =>
  p.then(
    () => true,
    () => false
  )
const DAY1 = new Date('2026-01-01T10:00:00Z')
const DAY2 = new Date('2026-01-02T10:00:00Z')

describe('td goals', () => {
  const service = new TdGoalsService(dataSource)
  const gemsOf = async (userId: string) =>
    Number(
      (
        await sql<{ t: string }[]>(
          `SELECT COALESCE(SUM(amount),0) t FROM td.currency_ledger WHERE user_id=$1 AND currency='gems'`,
          [userId]
        )
      )[0].t
    )
  const winBattle = (userId: string, at: Date) =>
    sql(
      `INSERT INTO td.battle_session (user_id, seed, status, expires_at, result, finished_at)
       VALUES ($1, 1, 'finished', $2, 'won', $2)`,
      [userId, at]
    )

  beforeAll(startTestDatabase)
  afterAll(stopTestDatabase)

  it('keeps goal_claim in the td schema and can be reverted and applied again', async () => {
    const migration = new AddTdGoalClaim1795200000000()
    const queryRunner = dataSource.createQueryRunner()
    try {
      await migration.down(queryRunner)
      expect(
        await sql(`SELECT 1 FROM information_schema.tables WHERE table_name='goal_claim'`)
      ).toHaveLength(0)
    } finally {
      await migration.up(queryRunner)
      await queryRunner.release()
    }
    const t = await sql<{ table_schema: string }[]>(
      `SELECT table_schema FROM information_schema.tables WHERE table_name='goal_claim'`
    )
    expect(t.map(r => r.table_schema)).toEqual(['td'])
  })

  it('refuses a daily claim before the goal is done and pays gems once after it', async () => {
    const userId = await createUser('td')
    expect(await worked(service.claimDaily(userId, 'win_battle', DAY1))).toBe(false)
    await winBattle(userId, DAY1)
    await service.claimDaily(userId, 'win_battle', DAY1)
    expect(await gemsOf(userId)).toBe(30)
    expect(await worked(service.claimDaily(userId, 'win_battle', DAY1))).toBe(false)
    expect(await gemsOf(userId)).toBe(30)
  })

  it('pays a concurrent double claim exactly once', async () => {
    const userId = await createUser('td')
    await winBattle(userId, DAY1)
    const results = await Promise.all(
      [1, 2, 3, 4].map(() => worked(service.claimDaily(userId, 'win_battle', DAY1)))
    )
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(await gemsOf(userId)).toBe(30)
  })

  it('resets daily goals at the UTC day boundary', async () => {
    const userId = await createUser('td')
    await winBattle(userId, DAY1)
    await service.claimDaily(userId, 'win_battle', DAY1)
    const next = await service.getGoals(userId, DAY2)
    expect(next.daily.find(g => g.id === 'win_battle')).toMatchObject({
      complete: false,
      claimed: false,
    })
  })

  it('advances the 7-day track one day per UTC day and only after a daily goal', async () => {
    const userId = await createUser('td')
    expect(await worked(service.claimTrack(userId, DAY1))).toBe(false)
    await winBattle(userId, DAY1)
    await service.claimTrack(userId, DAY1)
    expect(await worked(service.claimTrack(userId, DAY1))).toBe(false)
    await winBattle(userId, DAY2)
    await service.claimTrack(userId, DAY2)
    expect(await gemsOf(userId)).toBe(20 + 30)
    expect((await service.getGoals(userId, DAY2)).track).toMatchObject({
      day: 3,
      claimedToday: true,
    })
  })

  it('grants an achievement from verified state and pays it once', async () => {
    const userId = await createUser('td')
    expect(await worked(service.claimAchievement(userId, 'stars_3', DAY1))).toBe(false)
    await sql(`INSERT INTO td.stage_progress (user_id, stage_id, stars) VALUES ($1,1,3)`, [userId])
    await service.claimAchievement(userId, 'stars_3', DAY1)
    expect(await worked(service.claimAchievement(userId, 'stars_3', DAY2))).toBe(false)
    expect(await gemsOf(userId)).toBe(100)
  })
})
