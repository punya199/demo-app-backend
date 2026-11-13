// Runs against the throwaway Postgres via `yarn test:integration` (see monster/int-test-helpers.ts).
import { HttpException } from '@nestjs/common'
import dataSource from '../../config/database.config'
import { AddTdBattleHeroPool1794900000000 } from '../../db/migrations/1794900000000-add-td-battle-hero-pool'
import { STARTER_POOL } from '../../libs/td-sim'
import { createUser, sql, startTestDatabase, stopTestDatabase } from '../monster/int-test-helpers'
import { STAR_UP_SHARD_COSTS } from './hero.config'
import { TdBattleService } from './td-battle.service'
import { TdGachaService } from './td-gacha.service'

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

describe('td owned heroes and star-up', () => {
  const gacha = new TdGachaService(dataSource)
  const battle = new TdBattleService(dataSource)
  const own = (userId: string, heroId: string, starLevel = 1) =>
    sql(`INSERT INTO td.hero_owned (user_id, hero_id, star_level) VALUES ($1,$2,$3)`, [
      userId,
      heroId,
      starLevel,
    ])
  const giveShards = (userId: string, amount: number) =>
    sql(
      `INSERT INTO td.currency_ledger (user_id, currency, amount, reason) VALUES ($1,'shards',$2,'test')`,
      [userId, amount]
    )
  const starOf = async (userId: string, heroId: string) =>
    (
      await sql<{ star_level: number }[]>(
        `SELECT star_level FROM td.hero_owned WHERE user_id=$1 AND hero_id=$2`,
        [userId, heroId]
      )
    )[0].star_level
  const poolOf = async (battleId: string) =>
    (
      await sql<{ hero_pool: unknown }[]>(`SELECT hero_pool FROM td.battle_session WHERE id=$1`, [
        battleId,
      ])
    )[0].hero_pool

  beforeAll(startTestDatabase)
  afterAll(stopTestDatabase)

  it('keeps hero_pool on td.battle_session and can be reverted and applied again', async () => {
    const migration = new AddTdBattleHeroPool1794900000000()
    const queryRunner = dataSource.createQueryRunner()
    try {
      await migration.down(queryRunner)
      expect(
        await sql(`SELECT 1 FROM information_schema.columns WHERE column_name='hero_pool'`)
      ).toHaveLength(0)
    } finally {
      await migration.up(queryRunner)
      await queryRunner.release()
    }
  })

  it('star-up spends shards through the ledger, raises the star and unlocks nothing it cannot afford', async () => {
    const userId = await createUser('td')
    await own(userId, 'void-blade')
    await giveShards(userId, STAR_UP_SHARD_COSTS[0] + 5)
    const res = await gacha.starUp(userId, 'void-blade', T0)
    expect(res).toMatchObject({ starLevel: 2, balances: { shards: 5 } })
    expect(await starOf(userId, 'void-blade')).toBe(2)
    // the next step costs more than the 5 left: rejected, nothing changes
    expect(await statusOf(gacha.starUp(userId, 'void-blade', T0))).toBe(400)
    expect(await starOf(userId, 'void-blade')).toBe(2)
  })

  it('rejects star-up with too few shards, and for a hero that is not owned', async () => {
    const userId = await createUser('td')
    await own(userId, 'void-blade')
    await giveShards(userId, STAR_UP_SHARD_COSTS[0] - 1)
    expect(await statusOf(gacha.starUp(userId, 'void-blade', T0))).toBe(400)
    expect(await starOf(userId, 'void-blade')).toBe(1)
    expect(await statusOf(gacha.starUp(userId, 'sun-oracle', T0))).toBe(404)
  })

  it('a battle stores the owned heroes at start; a later star-up does not touch it', async () => {
    const userId = await createUser('td')
    await own(userId, 'void-blade')
    await own(userId, 'cinder-witch', 2)
    await giveShards(userId, 1000)
    const { battleId, pool } = await battle.start(userId, T0)
    const expected = [
      { hero: 'cinder-witch', star: 2 },
      { hero: 'void-blade', star: 1 },
    ]
    expect(pool).toEqual(expected)
    await gacha.starUp(userId, 'void-blade', T0)
    await own(userId, 'sun-oracle')
    expect(await poolOf(battleId)).toEqual(expected)
  })

  it('a new player with no heroes battles with the starter pool', async () => {
    const userId = await createUser('td')
    const { pool } = await battle.start(userId, T0)
    expect(pool).toEqual(STARTER_POOL)
  })
})
