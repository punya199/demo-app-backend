// Runs against a real, throwaway Postgres via `yarn test:integration` (see int-test-helpers.ts).
import dataSource from '../../config/database.config'
import { EnumEquipmentGrade, EnumEquipmentSlot } from './equipment-data'
import { InventoryService } from './inventory.service'
import {
  buildCore,
  createUserWithMonster,
  sql,
  startTestDatabase,
  stopTestDatabase,
  succeeded,
} from './int-test-helpers'
import { bossTokenItemId } from './raid-data'
import { getWeek } from './world-boss-data'
import { WorldBossService } from './world-boss.service'

jest.setTimeout(120_000)

describe('world boss', () => {
  const { wallet, monsters } = buildCore()
  const inventory = new InventoryService(dataSource, monsters)
  const worldBoss = new WorldBossService(dataSource, monsters, inventory, wallet)
  const week = getWeek(new Date()).key

  const striker = () => createUserWithMonster(monsters, 'ultimate', 'flame_ultimate', 'wb')
  const bossRow = async () =>
    (
      await sql<
        { hp: number; max_hp: number; defeated_at: Date | null; killed_by_user_id: string | null }[]
      >(`SELECT hp, max_hp, defeated_at, killed_by_user_id FROM world_bosses WHERE week=$1`, [week])
    )[0]

  beforeAll(async () => {
    await startTestDatabase()
    // One boss per week is global, so start clean (this database is throwaway by the guard).
    await sql('DELETE FROM world_boss_damage')
    await sql('DELETE FROM world_bosses')
  })
  afterAll(stopTestDatabase)

  it('creates the week row once however many ask at the same time', async () => {
    const user = await striker()
    await Promise.all(Array.from({ length: 10 }, () => worldBoss.getStatus(user)))
    const [count] = await sql<{ c: number }[]>(
      `SELECT count(*)::int c FROM world_bosses WHERE week=$1`,
      [week]
    )
    expect(count.c).toBe(1)
    const status = await worldBoss.getStatus(user)
    expect(status.boss.hp).toBe(status.boss.maxHp)
    expect(status.hitsLeft).toBe(3)
  })

  it('keeps young monsters out', async () => {
    const baby = await createUserWithMonster(monsters, 'baby_2', 'flame_baby2', 'wb')
    await expect(worldBoss.attack(baby)).rejects.toThrow(/too young/)
  })

  it('subtracts exactly the damage recorded when many players attack at once', async () => {
    const before = await bossRow()
    const users = await Promise.all(Array.from({ length: 6 }, striker))
    const results = await Promise.allSettled(users.map(user => worldBoss.attack(user)))
    expect(succeeded(results)).toBe(6)
    const after = await bossRow()
    const [sum] = await sql<{ total: number; hits: number }[]>(
      `SELECT COALESCE(SUM(d.damage),0)::int total, COALESCE(SUM(d.hits),0)::int hits
       FROM world_boss_damage d JOIN world_bosses b ON b.id = d.world_boss_id WHERE b.week=$1`,
      [week]
    )
    expect(before.hp - after.hp).toBe(sum.total)
    expect(sum.total).toBeGreaterThan(0)
    expect(sum.hits).toBeGreaterThanOrEqual(6)
    expect(after.hp).toBeGreaterThanOrEqual(0)
  })

  it('allows exactly three hits a day however many arrive at once', async () => {
    const user = await striker()
    const burst = await Promise.allSettled(Array.from({ length: 8 }, () => worldBoss.attack(user)))
    expect(succeeded(burst)).toBe(3)
    expect((await worldBoss.getStatus(user)).hitsLeft).toBe(0)
    expect((await worldBoss.getStatus(user)).myHits).toBe(3)
    const [row] = await sql<{ wins: number; losses: number }[]>(
      `SELECT wins, losses FROM monsters WHERE owner_id=$1`,
      [user]
    )
    expect(row.wins + row.losses).toBe(0)
  })

  it('credits the finishing hit, caps damage at the HP left, and then refuses more', async () => {
    const finisher = await striker()
    await sql(`UPDATE world_bosses SET hp = 40 WHERE week=$1`, [week])
    const result = await worldBoss.attack(finisher)
    expect(result.isKillingBlow).toBe(true)
    expect(result.damage).toBe(40)
    expect(result.bossHp).toBe(0)
    const row = await bossRow()
    expect(row.hp).toBe(0)
    expect(row.defeated_at).not.toBeNull()
    expect(row.killed_by_user_id).toBe(finisher)
    await expect(worldBoss.attack(await striker())).rejects.toThrow(/not active/)
  })

  it('pays a defeated boss once, with the guaranteed killing-blow piece and the token', async () => {
    const [finisher] = await sql<{ id: string }[]>(
      `SELECT killed_by_user_id AS id FROM world_bosses WHERE week=$1`,
      [week]
    )
    const user = finisher.id
    const before = await wallet.getBalance(user)
    const claims = await Promise.allSettled(
      Array.from({ length: 4 }, () => worldBoss.claim(user, week))
    )
    expect(succeeded(claims)).toBe(1)
    const after = await wallet.getBalance(user)
    // 1 hit: 50 coins + 200 defeat bonus; 1 raid token + 5 bonus + the rank tier's tokens
    expect(after.coin - before.coin).toBe(250)
    expect(after.raidToken - before.raidToken).toBeGreaterThanOrEqual(6)
    const tokens =
      (await inventory.getInventory(user)).items.find(
        item => item.itemId === bossTokenItemId('storm_golem')
      )?.quantity ?? 0
    expect(tokens).toBeGreaterThanOrEqual(1)
    const [piece] = await sql<{ set_id: string; grade: string }[]>(
      `SELECT set_id, grade FROM equipment_items WHERE user_id=$1 AND set_id='swift_thunder'`,
      [user]
    )
    expect(piece.set_id).toBe('swift_thunder')
    expect(piece.grade).toBe(EnumEquipmentGrade.EPIC)
    await expect(worldBoss.claim(user, week)).rejects.toThrow(/No world boss reward/)
  })

  it('refuses to claim a week that is still running', async () => {
    await sql(
      `UPDATE world_bosses SET hp = 5000, defeated_at = NULL, killed_by_user_id = NULL WHERE week=$1`,
      [week]
    )
    const user = await striker()
    await worldBoss.attack(user)
    await expect(worldBoss.claim(user, week)).rejects.toThrow(/not ended/)
    await expect(worldBoss.claim(user, '2000-W01')).rejects.toThrow(/not found/i)
  })

  it('ranks players by damage for a finished week, claims reproducibly, and leaks no ids', async () => {
    const [{ id: pastId }] = await sql<{ id: string }[]>(
      `INSERT INTO world_bosses (week, boss_id, max_hp, hp, starts_at, ends_at)
       VALUES ('2000-W01','storm_golem',30000,20000,'2000-01-03','2000-01-10') RETURNING id`
    )
    const [first, second, third] = await Promise.all([striker(), striker(), striker()])
    await sql(
      `INSERT INTO world_boss_damage (world_boss_id, user_id, damage, hits)
       VALUES ($1,$2,5000,3), ($1,$3,3000,3), ($1,$4,3000,1)`,
      [pastId, first, second, third]
    )
    const status = await worldBoss.getStatus(first)
    expect(status.claimable[0]).toMatchObject({ week: '2000-W01', rank: 1 })
    expect((await worldBoss.getStatus(second)).claimable[0].rank).toBe(2)
    expect((await worldBoss.getStatus(third)).claimable[0].rank).toBe(2) // tied with second

    const ranking = await worldBoss.getRanking(first, '2000-W01')
    expect(ranking.entries.map(entry => entry.rank)).toEqual([1, 2, 2])
    expect(JSON.stringify(ranking)).not.toContain(first)
    expect(JSON.stringify(ranking)).not.toContain('username')
    expect(ranking.entries.find(entry => entry.isMe)?.rank).toBe(1)

    // The piece roll comes from the ids, so a retry after a refusal can't re-roll it.
    const preview = status.claimable[0].reward.pieceGrade
    await sql(
      `INSERT INTO equipment_items (user_id, template_id, slot, grade, main_value)
       SELECT $1,'wooden_sword','weapon','common',4 FROM generate_series(1, 60)`,
      [first]
    )
    await expect(worldBoss.claim(first, '2000-W01')).rejects.toThrow(/bag is full/)
    await sql(`DELETE FROM equipment_items WHERE user_id=$1`, [first])
    const claimed = await worldBoss.claim(first, '2000-W01')
    expect(claimed.reward.pieceGrade).toBe(preview)
    expect(claimed.rank).toBe(1)
  })

  it('exchanges boss tokens for a set piece only after taking part, and never for legendary', async () => {
    const newcomer = await striker()
    await expect(
      worldBoss.exchange(newcomer, 'storm_golem', EnumEquipmentSlot.ARMOR, EnumEquipmentGrade.RARE)
    ).rejects.toThrow(/Take part/)

    const [{ id: pastId }] = await sql<{ id: string }[]>(
      `SELECT id FROM world_bosses WHERE week='2000-W01'`
    )
    const veteran = await striker()
    await sql(
      `INSERT INTO world_boss_damage (world_boss_id, user_id, damage, hits, reward_claimed_at)
       VALUES ($1,$2,100,1, now())`,
      [pastId, veteran]
    )
    await dataSource.transaction(etm =>
      inventory.add(veteran, bossTokenItemId('storm_golem'), etm, 25)
    )
    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () =>
        worldBoss.exchange(veteran, 'storm_golem', EnumEquipmentSlot.ARMOR, EnumEquipmentGrade.RARE)
      )
    )
    expect(succeeded(results)).toBe(1) // 25 tokens = one piece at 20, not two
    await expect(
      worldBoss.exchange(
        veteran,
        'storm_golem',
        EnumEquipmentSlot.ARMOR,
        EnumEquipmentGrade.LEGENDARY
      )
    ).rejects.toThrow(/not found/i)
  })
})
