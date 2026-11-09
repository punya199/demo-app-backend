// Runs against a real, throwaway Postgres via `yarn test:integration` (see int-test-helpers.ts).
import dataSource from '../../../config/database.config'
import { CRAFT_PITY_AFTER_FAILS, findCraftRecipe, ICraftOverview } from './craft-data'
import { CRAFT_CATALYST_ID } from './craft-materials'
import { CraftService } from './craft.service'
import { EnumEquipmentGrade } from './equipment-data'
import { InventoryService } from '../inventory/inventory.service'
import {
  buildCore,
  createUser,
  give,
  sql,
  startTestDatabase,
  stopTestDatabase,
  succeeded,
} from '../int-test-helpers'
import { EQUIPMENT_CAPACITY } from '../core/monster-rules'

jest.setTimeout(120_000)

describe('craft queue', () => {
  const { wallet, monsters } = buildCore()
  const inventory = new InventoryService(dataSource, monsters)
  const craft = new CraftService(dataSource, inventory, wallet)
  const standard = findCraftRecipe('bulwark:weapon')!
  const flagship = findCraftRecipe('evergreen:weapon')!

  const stock = (userId: string, itemId: string, quantity: number) =>
    dataSource.transaction(etm => inventory.add(userId, itemId, etm, quantity))
  const stockFor = async (userId: string, recipe = standard, catalyst = 0) => {
    for (const need of recipe.materials) await stock(userId, need.itemId, need.qty)
    if (catalyst) await stock(userId, CRAFT_CATALYST_ID, catalyst)
  }
  const owned = async (userId: string, itemId: string) =>
    (await inventory.getInventory(userId)).items.find(item => item.itemId === itemId)?.quantity ?? 0
  const coins = async (userId: string) => (await wallet.getBalance(userId)).coin
  const finishNow = (userId: string) =>
    sql(
      `UPDATE craft_jobs SET finish_at = now() - interval '1 second' WHERE user_id = $1 AND claimed_at IS NULL`,
      [userId]
    )
  const bagCount = async (userId: string) =>
    (
      await sql<{ c: number }[]>(`SELECT count(*)::int c FROM equipment_items WHERE user_id=$1`, [
        userId,
      ])
    )[0].c
  const readyUser = async (recipe = standard, catalyst = 0) => {
    const userId = await createUser('craft')
    await give(userId, 100_000)
    await stockFor(userId, recipe, catalyst)
    return userId
  }

  beforeAll(startTestDatabase)
  afterAll(stopTestDatabase)

  it('lists every recipe from the start, and says which can be started', async () => {
    const userId = await createUser('craft')
    await give(userId, 1000)
    const empty = await craft.getOverview(userId)
    expect(empty.recipes).toHaveLength(48)
    expect(empty.recipes.every(recipe => !recipe.canStart)).toBe(true)
    expect(empty.queue).toBeNull()
    expect(empty.coin).toBe(1000)
    await stockFor(userId)
    const stocked = await craft.getOverview(userId)
    expect(stocked.recipes.find(recipe => recipe.id === standard.id)).toMatchObject({
      canStart: true,
      name: expect.any(String),
    })
    expect(stocked.recipes.find(recipe => recipe.id === flagship.id)?.canStart).toBe(false)
    expect(stocked.catalyst.pity).toEqual([
      { step: 'epic_legendary', fails: 0, guaranteeAfter: CRAFT_PITY_AFTER_FAILS },
      { step: 'legendary_mythic', fails: 0, guaranteeAfter: CRAFT_PITY_AFTER_FAILS },
    ])
  })

  it('refuses a start without enough materials, Coin or a known recipe, and charges nothing', async () => {
    const userId = await createUser('craft')
    await give(userId, 1000)
    await stock(userId, standard.materials[0].itemId, 1)
    await expect(craft.start(userId, standard.id, false)).rejects.toThrow(/materials/)
    await expect(craft.start(userId, 'nope:weapon', false)).rejects.toThrow(/Recipe/)
    await stockFor(userId)
    // Everything but a Catalyst we do not have.
    await expect(craft.start(userId, standard.id, true)).rejects.toThrow(/materials/)
    await give(userId, standard.coin - 1)
    await expect(craft.start(userId, standard.id, false)).rejects.toThrow(/coins/)
    expect(await coins(userId)).toBe(standard.coin - 1)
    expect(await owned(userId, standard.materials[0].itemId)).toBe(standard.materials[0].qty + 1)
    expect((await craft.getOverview(userId)).queue).toBeNull()
  })

  it('starts a craft: takes the Coin and every material, one job per player', async () => {
    const userId = await readyUser()
    const overview = await craft.start(userId, standard.id, false)
    expect(overview.queue).toMatchObject({
      recipeId: standard.id,
      useCatalyst: false,
      status: 'running',
    })
    expect(overview.coin).toBe(100_000 - standard.coin)
    for (const need of standard.materials) expect(await owned(userId, need.itemId)).toBe(0)
    const finish = Date.parse(overview.queue!.finishAt)
    expect(finish - Date.parse(overview.queue!.startedAt)).toBe(standard.minutes * 60_000)

    await stockFor(userId)
    await expect(craft.start(userId, standard.id, false)).rejects.toThrow(/already/)
    // The refused second start took nothing.
    expect(await coins(userId)).toBe(100_000 - standard.coin)
    expect(await owned(userId, standard.materials[0].itemId)).toBe(standard.materials[0].qty)
    const [{ n }] = await sql<{ n: number }[]>(
      `SELECT count(*)::int n FROM craft_jobs WHERE user_id=$1`,
      [userId]
    )
    expect(n).toBe(1)
  })

  it('lets only one of several simultaneous starts through, charging once', async () => {
    const userId = await readyUser()
    await stockFor(userId)
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => craft.start(userId, standard.id, false))
    )
    expect(succeeded(results)).toBe(1)
    expect(await coins(userId)).toBe(100_000 - standard.coin)
    expect(await owned(userId, standard.materials[0].itemId)).toBe(standard.materials[0].qty)
  })

  it('claims only after the timer, once, and logs the roll', async () => {
    const userId = await readyUser()
    await craft.start(userId, standard.id, false)
    await expect(craft.claim(userId)).rejects.toThrow(/not finished/)
    await finishNow(userId)
    expect((await craft.getOverview(userId)).queue).toMatchObject({ status: 'ready' })

    const results = await Promise.allSettled([craft.claim(userId), craft.claim(userId)])
    expect(succeeded(results)).toBe(1)
    expect(await bagCount(userId)).toBe(1)
    const claimed = (
      results.find(result => result.status === 'fulfilled') as PromiseFulfilledResult<
        Awaited<ReturnType<typeof craft.claim>>
      >
    ).value
    expect(claimed).toMatchObject({ upgraded: false, item: { setId: 'bulwark', slot: 'weapon' } })
    expect(claimed.item.grade).toBe(EnumEquipmentGrade.EPIC)
    expect(claimed.overview.queue).toBeNull()
    await expect(craft.claim(userId)).rejects.toThrow(/no craft/i)

    const [log] = await sql<{ payload: { recipeId: string; grade: string } }[]>(
      `SELECT payload FROM equipment_logs WHERE user_id=$1 AND type='craft'`,
      [userId]
    )
    expect(log.payload).toMatchObject({ recipeId: standard.id, grade: 'epic', useCatalyst: false })
    // A new craft can start once the old one is claimed.
    await stockFor(userId)
    await expect(craft.start(userId, standard.id, false)).resolves.toBeDefined()
  })

  it('keeps the job when the bag is full (409), and claims after space is freed', async () => {
    const userId = await readyUser()
    await craft.start(userId, standard.id, false)
    await finishNow(userId)
    await sql(
      `INSERT INTO equipment_items (user_id, template_id, slot, grade, main_value)
       SELECT $1,'wooden_sword','weapon','common',4 FROM generate_series(1, ${EQUIPMENT_CAPACITY})`,
      [userId]
    )
    await expect(craft.claim(userId)).rejects.toMatchObject({ status: 409 })
    await expect(craft.claim(userId)).rejects.toThrow(/full/)
    expect((await craft.getOverview(userId)).queue).toMatchObject({ status: 'ready' })
    expect(await bagCount(userId)).toBe(EQUIPMENT_CAPACITY)

    await sql(
      `DELETE FROM equipment_items WHERE user_id=$1 AND id IN (
      SELECT id FROM equipment_items WHERE user_id=$1 LIMIT 1)`,
      [userId]
    )
    const result = await craft.claim(userId)
    expect(result.item.templateId).toBe('bulwark_weapon')
    expect(await bagCount(userId)).toBe(EQUIPMENT_CAPACITY)
  })

  it('uses the Catalyst and guarantees the upgrade after 8 failures in a row', async () => {
    const userId = await readyUser(flagship, 2)
    await sql(`INSERT INTO craft_pity (user_id, step, fails) VALUES ($1,'legendary_mythic',$2)`, [
      userId,
      CRAFT_PITY_AFTER_FAILS,
    ])
    await craft.start(userId, flagship.id, true)
    expect(await owned(userId, CRAFT_CATALYST_ID)).toBe(1)
    await finishNow(userId)
    const result = await craft.claim(userId)
    expect(result).toMatchObject({ upgraded: true, item: { grade: 'mythic' } })
    // A mythic piece carries its 2 guaranteed specials, and the counter starts over.
    expect(result.item.specialOptions?.length).toBeGreaterThanOrEqual(2)
    const pity = result.overview.catalyst.pity.find(row => row.step === 'legendary_mythic')
    expect(pity?.fails).toBe(0)
  })

  it('counts failures per step, spends the Catalyst either way, and leaves pity alone without one', async () => {
    const userId = await readyUser(standard, 1)
    // Fails 3 below the guarantee: the result is random, so only check the bookkeeping.
    await sql(`INSERT INTO craft_pity (user_id, step, fails) VALUES ($1,'epic_legendary',3)`, [
      userId,
    ])
    await craft.start(userId, standard.id, true)
    expect(await owned(userId, CRAFT_CATALYST_ID)).toBe(0)
    await finishNow(userId)
    const result = await craft.claim(userId)
    const pity = result.overview.catalyst.pity
    expect(pity.find(row => row.step === 'legendary_mythic')?.fails).toBe(0)
    const fails = pity.find(row => row.step === 'epic_legendary')?.fails
    expect(result.upgraded ? fails === 0 : fails === 4).toBe(true)
    expect(result.item.grade).toBe(result.upgraded ? 'legendary' : 'epic')

    // Without a Catalyst the counter is untouched.
    await sql(`UPDATE craft_pity SET fails = 5 WHERE user_id=$1 AND step='epic_legendary'`, [
      userId,
    ])
    await stockFor(userId)
    await craft.start(userId, standard.id, false)
    await finishNow(userId)
    const plain = await craft.claim(userId)
    expect(plain.item.grade).toBe('epic')
    expect(plain.overview.catalyst.pity.find(row => row.step === 'epic_legendary')?.fails).toBe(5)
  })

  it('keeps pity separate for each player', async () => {
    const [first, second] = [await readyUser(standard, 1), await readyUser(standard, 1)]
    await sql(`INSERT INTO craft_pity (user_id, step, fails) VALUES ($1,'epic_legendary',8)`, [
      first,
    ])
    await craft.start(second, standard.id, true)
    await craft.start(first, standard.id, true)
    await finishNow(first)
    expect((await craft.claim(first)).upgraded).toBe(true)
    expect(
      (await craft.getOverview(second)).catalyst.pity.find(row => row.step === 'epic_legendary')
        ?.fails
    ).toBe(0)
  })

  it('never returns a player id in any craft response', async () => {
    const userId = await readyUser()
    const seen: unknown[] = [await craft.getOverview(userId)]
    seen.push(await craft.start(userId, standard.id, false))
    await finishNow(userId)
    seen.push(await craft.claim(userId))
    const text = JSON.stringify(seen)
    expect(text).not.toContain(userId)
    expect(text).not.toMatch(/user_?id|username|email/i)
    const overview = seen[0] as ICraftOverview
    expect(overview.recipes.length).toBe(48)
  })
})
