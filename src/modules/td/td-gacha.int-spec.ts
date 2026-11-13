// Runs against the throwaway Postgres via `yarn test:integration` (see monster/int-test-helpers.ts).
import { AddTdGacha1794700000000 } from '../../db/migrations/1794700000000-add-td-gacha'
import dataSource from '../../config/database.config'
import {
  createUser,
  sql,
  startTestDatabase,
  stopTestDatabase,
  succeeded,
} from '../monster/int-test-helpers'
import { rollHero } from './gacha'
import { GACHA_PITY_LIMIT } from './gacha.config'
import { TdGachaService } from './td-gacha.service'

jest.setTimeout(120_000)

const DAY1 = new Date('2026-01-01T10:00:00Z')
const DAY2 = new Date('2026-01-02T10:00:00Z')

describe('td gacha', () => {
  const service = new TdGachaService(dataSource)
  const giveGems = (userId: string, amount: number) =>
    sql(
      `INSERT INTO td.currency_ledger (user_id, currency, amount, reason) VALUES ($1,'gems',$2,'test')`,
      [userId, amount]
    )
  const gemsOf = async (userId: string) =>
    Number(
      (
        await sql<{ t: string }[]>(
          `SELECT COALESCE(SUM(amount),0) t FROM td.currency_ledger WHERE user_id=$1 AND currency='gems'`,
          [userId]
        )
      )[0].t
    )

  beforeAll(startTestDatabase)
  afterAll(stopTestDatabase)

  it('keeps the gacha tables in the td schema and can be reverted and applied again', async () => {
    const tables = await sql<{ table_schema: string }[]>(
      `SELECT table_schema FROM information_schema.tables
       WHERE table_name IN ('hero_owned','gacha_pity','gacha_pull')`
    )
    expect(tables.map(t => t.table_schema)).toEqual(['td', 'td', 'td'])
    const migration = new AddTdGacha1794700000000()
    const queryRunner = dataSource.createQueryRunner()
    try {
      await migration.down(queryRunner)
      expect(
        await sql(`SELECT 1 FROM information_schema.tables WHERE table_name='gacha_pull'`)
      ).toHaveLength(0)
    } finally {
      await migration.up(queryRunner)
      await queryRunner.release()
    }
  })

  it('spends 150 gems on a single pull, grants the hero and logs the seed', async () => {
    const userId = await createUser('td')
    await giveGems(userId, 1000)
    const res = await service.pull(userId, 'single', DAY1)
    expect(res.cost).toBe(150)
    expect(res.balances.gems).toBe(850)
    expect(await gemsOf(userId)).toBe(850)
    const [log] = await sql<{ seed: string; hero_id: string; pity_before: number }[]>(
      `SELECT seed, hero_id, pity_before FROM td.gacha_pull WHERE user_id=$1`,
      [userId]
    )
    // The logged seed reproduces the logged hero.
    expect(rollHero(Number(log.seed), log.pity_before).hero.id).toBe(log.hero_id)
    expect(await sql(`SELECT 1 FROM td.hero_owned WHERE user_id=$1`, [userId])).toHaveLength(1)
  })

  it('charges 1350 for a 10-pull and logs ten rows in one batch', async () => {
    const userId = await createUser('td')
    await giveGems(userId, 1350)
    const res = await service.pull(userId, 'ten', DAY1)
    expect(res.pulls).toHaveLength(10)
    expect(await gemsOf(userId)).toBe(0)
    const [{ n, b }] = await sql<{ n: number; b: number }[]>(
      `SELECT count(*)::int n, count(DISTINCT batch_id)::int b FROM td.gacha_pull WHERE user_id=$1`,
      [userId]
    )
    expect([n, b]).toEqual([10, 1])
  })

  it('rejects insufficient gems and leaves no trace', async () => {
    const userId = await createUser('td')
    await giveGems(userId, 149)
    await expect(service.pull(userId, 'single', DAY1)).rejects.toThrow('Not enough gems')
    expect(await gemsOf(userId)).toBe(149)
    expect(await sql(`SELECT 1 FROM td.gacha_pull WHERE user_id=$1`, [userId])).toHaveLength(0)
    expect(await sql(`SELECT 1 FROM td.hero_owned WHERE user_id=$1`, [userId])).toHaveLength(0)
  })

  it('lets the free pull be claimed once per UTC day', async () => {
    const userId = await createUser('td')
    await service.pull(userId, 'free', DAY1)
    await expect(service.pull(userId, 'free', DAY1)).rejects.toThrow('already claimed')
    await service.pull(userId, 'free', DAY2)
    expect(await gemsOf(userId)).toBe(0)
  })

  it('serialises parallel pulls: gems for exactly one single pull allow exactly one', async () => {
    const userId = await createUser('td')
    await giveGems(userId, 150)
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => service.pull(userId, 'single', DAY1))
    )
    expect(succeeded(results)).toBe(1)
    expect(await gemsOf(userId)).toBe(0)
    expect(await sql(`SELECT 1 FROM td.gacha_pull WHERE user_id=$1`, [userId])).toHaveLength(1)
  })

  it('lets a free pull be claimed only once under parallel requests', async () => {
    const userId = await createUser('td')
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => service.pull(userId, 'free', DAY1))
    )
    expect(succeeded(results)).toBe(1)
  })

  it('persists pity across calls and guarantees a Legendary by the limit', async () => {
    const userId = await createUser('td')
    await giveGems(userId, 150 * GACHA_PITY_LIMIT)
    let sinceLegendary = 0
    for (let i = 0; i < GACHA_PITY_LIMIT; i++) {
      const res = await service.pull(userId, 'single', DAY1)
      sinceLegendary = res.pulls[0].rarity === 'legendary' ? 0 : sinceLegendary + 1
      expect(sinceLegendary).toBeLessThan(GACHA_PITY_LIMIT)
    }
    const view = await service.getGacha(userId, DAY1)
    expect(view.state.pity).toBe(sinceLegendary)
  })

  it('turns duplicates into shards through the ledger', async () => {
    const userId = await createUser('td')
    await giveGems(userId, 150 * 40)
    for (let i = 0; i < 40; i++) await service.pull(userId, 'single', DAY1)
    const dupes = await sql<{ n: number }[]>(
      `SELECT count(*)::int n FROM td.gacha_pull WHERE user_id=$1 AND duplicate`,
      [userId]
    )
    expect(dupes[0].n).toBeGreaterThan(0)
    const shards = await sql<{ t: string }[]>(
      `SELECT COALESCE(SUM(amount),0) t FROM td.currency_ledger WHERE user_id=$1 AND currency='shards'`,
      [userId]
    )
    expect(Number(shards[0].t)).toBeGreaterThan(0)
  })
})
