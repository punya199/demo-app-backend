// Runs against the throwaway Postgres via `yarn test:integration` (see monster/int-test-helpers.ts).
import { HttpException } from '@nestjs/common'
import dataSource from '../../config/database.config'
import { AddTdRelic1795400000000 } from '../../db/migrations/1795400000000-add-td-relic'
import { RELICS } from '../../libs/td-sim'
import { createUser, sql, startTestDatabase, stopTestDatabase } from '../monster/int-test-helpers'
import { RELIC_UNLOCK_COSTS } from './relic.config'
import { TdBattleService } from './td-battle.service'
import { TdRelicService } from './td-relic.service'

jest.setTimeout(120_000)

const T0 = new Date('2026-01-01T10:00:00Z')
const COST = RELIC_UNLOCK_COSTS['ember-brand']
const HERO = RELICS['ember-brand'].hero

const statusOf = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return (e as HttpException).getStatus()
  }
  return 0
}

describe('td relics', () => {
  const relics = new TdRelicService(dataSource)
  const battle = new TdBattleService(dataSource)
  const give = (userId: string, currency: string, amount: number) =>
    sql(
      `INSERT INTO td.currency_ledger (user_id, currency, amount, reason) VALUES ($1,$2,$3,'test')`,
      [userId, currency, amount]
    )
  const giveHero = (userId: string, heroId: string) =>
    sql(`INSERT INTO td.hero_owned (user_id, hero_id) VALUES ($1,$2)`, [userId, heroId])
  const giveCore = (userId: string, element: string) =>
    sql(`INSERT INTO td.core (user_id, element, rarity, source) VALUES ($1,$2,'common',$3)`, [
      userId,
      element,
      `test:${element}`,
    ])
  // A player who may unlock ember-brand, with `extra` coins and shards left over.
  const ready = async (extra = 0) => {
    const userId = await createUser('td')
    await giveHero(userId, HERO)
    await giveCore(userId, 'fire')
    await give(userId, 'coins', COST.coins + extra)
    await give(userId, 'shards', COST.shards + extra)
    return userId
  }

  beforeAll(startTestDatabase)
  afterAll(stopTestDatabase)

  it('keeps relic in the td schema and can be reverted and applied again', async () => {
    const migration = new AddTdRelic1795400000000()
    const queryRunner = dataSource.createQueryRunner()
    try {
      await migration.down(queryRunner)
      expect(
        await sql(`SELECT 1 FROM information_schema.tables WHERE table_name='relic'`)
      ).toHaveLength(0)
    } finally {
      await migration.up(queryRunner)
      await queryRunner.release()
    }
    expect(
      await sql(
        `SELECT 1 FROM information_schema.tables WHERE table_name='relic' AND table_schema='td'`
      )
    ).toHaveLength(1)
  })

  it('unlocks for the matching hero and core, paying through the ledger', async () => {
    const userId = await ready(7)
    const res = await relics.unlock(userId, 'ember-brand', T0)
    expect(res.balances).toEqual({ coins: 7, shards: 7 })
    expect(res.relics.find(r => r.id === 'ember-brand')?.unlocked).toBe(true)
    expect((await relics.list(userId)).relics.find(r => r.id === 'ember-brand')?.unlocked).toBe(
      true
    )
  })

  it('refuses without the hero, without a core of its element, and without materials', async () => {
    const noHero = await createUser('td')
    await giveCore(noHero, 'fire')
    await give(noHero, 'coins', COST.coins)
    await give(noHero, 'shards', COST.shards)
    expect(await statusOf(relics.unlock(noHero, 'ember-brand', T0))).toBe(400)

    const noCore = await createUser('td')
    await giveHero(noCore, HERO)
    await giveCore(noCore, 'ice')
    await give(noCore, 'coins', COST.coins)
    await give(noCore, 'shards', COST.shards)
    expect(await statusOf(relics.unlock(noCore, 'ember-brand', T0))).toBe(400)

    const poor = await createUser('td')
    await giveHero(poor, HERO)
    await giveCore(poor, 'fire')
    expect(await statusOf(relics.unlock(poor, 'ember-brand', T0))).toBe(400)
    expect(
      await sql(`SELECT 1 FROM td.relic WHERE user_id IN ($1,$2,$3)`, [noHero, noCore, poor])
    ).toHaveLength(0)
  })

  it('refuses a second unlock and charges once; two at once unlock once', async () => {
    const userId = await ready(COST.coins)
    const results = await Promise.all([
      statusOf(relics.unlock(userId, 'ember-brand', T0)),
      statusOf(relics.unlock(userId, 'ember-brand', T0)),
    ])
    expect(results.sort()).toEqual([0, 409])
    expect(await statusOf(relics.unlock(userId, 'ember-brand', T0))).toBe(409)
    const spent = await sql<{ total: string }[]>(
      `SELECT SUM(amount) AS total FROM td.currency_ledger WHERE user_id=$1 AND currency='coins'`,
      [userId]
    )
    expect(Number(spent[0].total)).toBe(COST.coins)
  })

  it('a battle stores the unlocked relics at start; later unlocks do not touch them', async () => {
    const userId = await ready()
    const before = await battle.start(userId, 1, T0)
    expect(before.relics).toEqual([])
    await relics.unlock(userId, 'ember-brand', T0)
    const after = await battle.start(userId, 1, new Date(T0.getTime() + 3_600_000))
    expect(after.relics).toEqual(['ember-brand'])
    const stored = await sql<{ relics: unknown }[]>(
      `SELECT relics FROM td.battle_session WHERE id=$1`,
      [before.battleId]
    )
    expect(stored[0].relics).toEqual([])
  })
})
