// Runs against the throwaway Postgres via `yarn test:integration` (see monster/int-test-helpers.ts).
import { HttpException } from '@nestjs/common'
import dataSource from '../../config/database.config'
import { AddTdGearMod1795000000000 } from '../../db/migrations/1795000000000-add-td-gear-mod'
import { MAX_GEAR_MOD } from '../../libs/td-sim'
import { createUser, sql, startTestDatabase, stopTestDatabase } from '../monster/int-test-helpers'
import { GEAR_MOD_COSTS_COINS } from './gear.config'
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

describe('td gear mod upgrades', () => {
  const gacha = new TdGachaService(dataSource)
  const battle = new TdBattleService(dataSource)
  const own = (userId: string, heroId: string) =>
    sql(`INSERT INTO td.hero_owned (user_id, hero_id) VALUES ($1,$2)`, [userId, heroId])
  const giveCoins = (userId: string, amount: number) =>
    sql(
      `INSERT INTO td.currency_ledger (user_id, currency, amount, reason) VALUES ($1,'coins',$2,'test')`,
      [userId, amount]
    )
  const levelOf = async (userId: string, heroId: string) =>
    (
      await sql<{ level: number }[]>(
        `SELECT level FROM td.gear_mod WHERE user_id=$1 AND hero_id=$2`,
        [userId, heroId]
      )
    )[0]?.level ?? 0

  beforeAll(startTestDatabase)
  afterAll(stopTestDatabase)

  it('keeps gear_mod in the td schema and can be reverted and applied again', async () => {
    const migration = new AddTdGearMod1795000000000()
    const queryRunner = dataSource.createQueryRunner()
    try {
      await migration.down(queryRunner)
      expect(
        await sql(`SELECT 1 FROM information_schema.tables WHERE table_name='gear_mod'`)
      ).toHaveLength(0)
    } finally {
      await migration.up(queryRunner)
      await queryRunner.release()
    }
    expect(
      await sql(
        `SELECT 1 FROM information_schema.tables WHERE table_name='gear_mod' AND table_schema='td'`
      )
    ).toHaveLength(1)
  })

  it('spends coins through the ledger and raises the mod level', async () => {
    const userId = await createUser('td')
    await own(userId, 'void-blade')
    await giveCoins(userId, GEAR_MOD_COSTS_COINS[0] + 5)
    const res = await gacha.upgradeGear(userId, 'void-blade', T0)
    expect(res).toMatchObject({
      modLevel: 1,
      cost: GEAR_MOD_COSTS_COINS[0],
      balances: { coins: 5 },
    })
    expect(await levelOf(userId, 'void-blade')).toBe(1)
    // the next step costs more than the 5 left: rejected, nothing changes
    expect(await statusOf(gacha.upgradeGear(userId, 'void-blade', T0))).toBe(400)
    expect(await levelOf(userId, 'void-blade')).toBe(1)
  })

  it('rejects an upgrade with no coins, for a hero not owned, and past the cap', async () => {
    const userId = await createUser('td')
    await own(userId, 'void-blade')
    expect(await statusOf(gacha.upgradeGear(userId, 'void-blade', T0))).toBe(400)
    expect(await statusOf(gacha.upgradeGear(userId, 'sun-oracle', T0))).toBe(404)
    await giveCoins(userId, 1_000_000)
    for (let i = 0; i < MAX_GEAR_MOD; i++) await gacha.upgradeGear(userId, 'void-blade', T0)
    expect(await statusOf(gacha.upgradeGear(userId, 'void-blade', T0))).toBe(409)
    expect(await levelOf(userId, 'void-blade')).toBe(MAX_GEAR_MOD)
  })

  it('two upgrades at once cannot spend the same coins twice', async () => {
    const userId = await createUser('td')
    await own(userId, 'void-blade')
    await giveCoins(userId, GEAR_MOD_COSTS_COINS[0])
    const results = await Promise.all([
      statusOf(gacha.upgradeGear(userId, 'void-blade', T0)),
      statusOf(gacha.upgradeGear(userId, 'void-blade', T0)),
    ])
    expect(results.sort()).toEqual([0, 400])
    expect(await levelOf(userId, 'void-blade')).toBe(1)
  })

  it('a battle stores the mod level at start; a later upgrade does not touch it', async () => {
    const userId = await createUser('td')
    await own(userId, 'void-blade')
    await giveCoins(userId, 1000)
    await gacha.upgradeGear(userId, 'void-blade', T0)
    const { battleId, pool } = await battle.start(userId, 1, T0)
    expect(pool).toEqual([{ hero: 'void-blade', star: 1, mod: 1 }])
    await gacha.upgradeGear(userId, 'void-blade', T0)
    const stored = await sql<{ hero_pool: unknown }[]>(
      `SELECT hero_pool FROM td.battle_session WHERE id=$1`,
      [battleId]
    )
    expect(stored[0].hero_pool).toEqual(pool)
  })
})
