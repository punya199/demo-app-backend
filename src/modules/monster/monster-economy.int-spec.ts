// Runs against a real, throwaway Postgres via `yarn test:integration` (see int-test-helpers.ts).
import dataSource from '../../config/database.config'
import { EnumMonsterLogType } from '../../db/entities/monster-log.entity'
import { AdventureService } from './adventure.service'
import { ExpeditionService } from './expedition.service'
import { InventoryService } from './inventory.service'
import {
  buildCore,
  createUser,
  createUserWithMonster,
  sql,
  startTestDatabase,
  stopTestDatabase,
  succeeded,
} from './int-test-helpers'
import { EnumShopItemId } from './shop-data'
import { QuestService, recordQuestProgress } from './quest.service'

jest.setTimeout(60_000)

describe('monster economy (inventory, quests, expedition)', () => {
  const { wallet, monsters } = buildCore()
  const inventory = new InventoryService(dataSource, monsters)
  const quests = new QuestService(dataSource, wallet)
  const expedition = new ExpeditionService(dataSource, monsters, inventory, wallet)
  const adventure = new AdventureService(dataSource, monsters, wallet)
  const feed = { type: EnumMonsterLogType.ACTION, at: new Date(), payload: { action: 'feed' } }
  let userId: string

  beforeAll(async () => {
    await startTestDatabase()
    userId = await createUser('econ')
  })
  afterAll(stopTestDatabase)

  it('caps concurrent first-time quest progress at the target', async () => {
    await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        dataSource.transaction(etm => recordQuestProgress(userId, new Date(), [feed], etm))
      )
    )
    const { quests: list } = await quests.getQuests(userId)
    expect(list.find(quest => (quest.id as string) === 'feed')!.progress).toBe(3)
  })

  it('refuses an incomplete quest and pays a complete one exactly once under a race', async () => {
    expect(succeeded(await Promise.allSettled([quests.claim(userId, 'train')]))).toBe(0)
    const claims = await Promise.allSettled(
      Array.from({ length: 5 }, () => quests.claim(userId, 'feed'))
    )
    expect(succeeded(claims)).toBe(1)
    expect((await wallet.getBalance(userId)).coin).toBe(10)
  })

  it('adds to the bag atomically and uses an item exactly once', async () => {
    await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        dataSource.transaction(etm => inventory.add(userId, EnumShopItemId.PROTEIN, etm))
      )
    )
    expect((await inventory.getInventory(userId)).items[0].quantity).toBe(10)

    const owner = await createUserWithMonster(monsters, 'adult', 'flame_adultGood', 'econ')
    await sql(`UPDATE monsters SET strength=1 WHERE owner_id=$1`, [owner])
    await dataSource.transaction(etm => inventory.add(owner, EnumShopItemId.PROTEIN, etm))
    const uses = await Promise.allSettled(
      Array.from({ length: 4 }, () => inventory.use(owner, EnumShopItemId.PROTEIN))
    )
    expect(succeeded(uses)).toBe(1)
    expect((await inventory.getInventory(owner)).items).toHaveLength(0)
    await expect(
      sql(`UPDATE inventory_items SET quantity=-1 WHERE user_id=$1`, [owner])
    ).rejects.toThrow()
  })

  it("sums today's auto-battle coins", async () => {
    await dataSource.transaction(etm =>
      wallet.change(userId, 'coin' as never, 7, 'auto_battle_reward' as never, 'x', etm)
    )
    const sum = await (
      adventure as unknown as {
        getAutoCoinsEarnedToday: (u: string, n: Date, e: unknown) => Promise<number>
      }
    ).getAutoCoinsEarnedToday(userId, new Date(), dataSource.manager)
    expect(sum).toBe(7)
  })

  it('pays an expedition once under a race and clears the trip', async () => {
    const owner = await createUserWithMonster(monsters, 'adult', 'flame_adultGood', 'econ')
    await expedition.start(owner, 'meadow')
    await sql(
      `UPDATE monsters SET expedition_minutes=300, expedition_rate=100, last_tick_at=now(), last_seen_at=now() WHERE owner_id=$1`,
      [owner]
    )
    const before = (await wallet.getBalance(owner)).coin
    const claims = await Promise.allSettled(
      Array.from({ length: 3 }, () => expedition.claim(owner))
    )
    expect(succeeded(claims)).toBe(1)
    expect((await wallet.getBalance(owner)).coin - before).toBe(500)
    const [row] = await sql<{ expedition_area_id: string | null }[]>(
      `SELECT expedition_area_id FROM monsters WHERE owner_id=$1`,
      [owner]
    )
    expect(row.expedition_area_id).toBeNull()
  })
})
