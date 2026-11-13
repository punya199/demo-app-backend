// Runs against the throwaway Postgres via `yarn test:integration` (see monster/int-test-helpers.ts).
import { HttpException } from '@nestjs/common'
import dataSource from '../../config/database.config'
import { AddTdCore1795313000000 } from '../../db/migrations/1795313000000-add-td-core'
import { CORE_SLOTS } from '../../libs/td-sim'
import { createUser, sql, startTestDatabase, stopTestDatabase } from '../monster/int-test-helpers'
import { CORE_FIRST_CLEAR_GRANTS, CORE_PROMOTE_COSTS } from './core.config'
import { TdBattleService } from './td-battle.service'
import { grantStageCore, TdCoreService } from './td-core.service'

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

describe('td cores', () => {
  const cores = new TdCoreService(dataSource)
  const battle = new TdBattleService(dataSource)
  const grant = (userId: string, stageId: number) =>
    dataSource.transaction(etm => grantStageCore(etm, userId, stageId))
  const give = (userId: string, currency: string, amount: number) =>
    sql(
      `INSERT INTO td.currency_ledger (user_id, currency, amount, reason) VALUES ($1,$2,$3,'test')`,
      [userId, currency, amount]
    )
  const coreIds = async (userId: string) =>
    (
      await sql<{ id: string }[]>(`SELECT id FROM td.core WHERE user_id=$1 ORDER BY source`, [
        userId,
      ])
    ).map(r => r.id)

  beforeAll(startTestDatabase)
  afterAll(stopTestDatabase)

  it('keeps core in the td schema and can be reverted and applied again', async () => {
    const migration = new AddTdCore1795313000000()
    const queryRunner = dataSource.createQueryRunner()
    try {
      await migration.down(queryRunner)
      expect(
        await sql(`SELECT 1 FROM information_schema.tables WHERE table_name='core'`)
      ).toHaveLength(0)
    } finally {
      await migration.up(queryRunner)
      await queryRunner.release()
    }
    expect(
      await sql(
        `SELECT 1 FROM information_schema.tables WHERE table_name='core' AND table_schema='td'`
      )
    ).toHaveLength(1)
  })

  it('grants the configured core once per stage, even when asked twice', async () => {
    const userId = await createUser('td')
    expect(await grant(userId, 1)).toEqual(CORE_FIRST_CLEAR_GRANTS[0])
    expect(await grant(userId, 1)).toBeNull()
    expect(await coreIds(userId)).toHaveLength(1)
    const list = await cores.list(userId)
    expect(list.slots).toBe(CORE_SLOTS)
    expect(list.cores[0]).toMatchObject({ ...CORE_FIRST_CLEAR_GRANTS[0], slot: null })
  })

  it('equips into any slot, swaps out the previous holder, and refuses other players cores', async () => {
    const userId = await createUser('td')
    const other = await createUser('td')
    await grant(userId, 1)
    await grant(userId, 2)
    await grant(other, 1)
    const [a, b] = await coreIds(userId)
    const [foreign] = await coreIds(other)
    await cores.equip(userId, a, 3, T0)
    const res = await cores.equip(userId, b, 3, T0)
    expect(res.cores.find(c => c.id === a)?.slot).toBeNull()
    expect(res.cores.find(c => c.id === b)?.slot).toBe(3)
    expect(await statusOf(cores.equip(userId, foreign, 0, T0))).toBe(404)
    expect(await statusOf(cores.equip(userId, a, CORE_SLOTS, T0))).toBe(400)
  })

  it('promotion spends coins and shards through the ledger and raises the rarity', async () => {
    const userId = await createUser('td')
    await grant(userId, 1)
    const [id] = await coreIds(userId)
    expect(await statusOf(cores.promote(userId, id, T0))).toBe(400) // no materials
    await give(userId, 'coins', CORE_PROMOTE_COSTS[0].coins + 7)
    await give(userId, 'shards', CORE_PROMOTE_COSTS[0].shards + 3)
    const res = await cores.promote(userId, id, T0)
    expect(res.core.rarity).toBe('rare')
    expect(res.balances).toEqual({ coins: 7, shards: 3 })
    expect(await statusOf(cores.promote(userId, id, T0))).toBe(400) // second step costs more
  })

  it('two promotions at once cannot spend the same materials twice', async () => {
    const userId = await createUser('td')
    await grant(userId, 1)
    const [id] = await coreIds(userId)
    await give(userId, 'coins', CORE_PROMOTE_COSTS[0].coins)
    await give(userId, 'shards', CORE_PROMOTE_COSTS[0].shards)
    const results = await Promise.all([
      statusOf(cores.promote(userId, id, T0)),
      statusOf(cores.promote(userId, id, T0)),
    ])
    expect(results.sort()).toEqual([0, 400])
  })

  it('a battle stores the equipped cores at start; a later change does not touch them', async () => {
    const userId = await createUser('td')
    await grant(userId, 1)
    const [id] = await coreIds(userId)
    await cores.equip(userId, id, 0, T0)
    const { battleId, cores: snapshot } = await battle.start(userId, 1, T0)
    expect(snapshot).toEqual([CORE_FIRST_CLEAR_GRANTS[0]])
    await give(userId, 'coins', CORE_PROMOTE_COSTS[0].coins)
    await give(userId, 'shards', CORE_PROMOTE_COSTS[0].shards)
    await cores.promote(userId, id, T0)
    const stored = await sql<{ cores: unknown }[]>(
      `SELECT cores FROM td.battle_session WHERE id=$1`,
      [battleId]
    )
    expect(stored[0].cores).toEqual(snapshot)
  })
})
