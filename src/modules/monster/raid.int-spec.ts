// Runs against a real, throwaway Postgres via `yarn test:integration` (see int-test-helpers.ts).
import dataSource from '../../config/database.config'
import { EquipmentItemEntity } from '../../db/entities/equipment-item.entity'
import {
  buildSetPiece,
  EnumEquipmentGrade,
  EnumEquipmentSlot,
  EnumMaterialId,
} from './equipment-data'
import { EquipmentService, grantItem } from './equipment.service'
import { InventoryService } from './inventory.service'
import {
  buildCore,
  createUserWithMonster,
  give,
  sql,
  startTestDatabase,
  stopTestDatabase,
  succeeded,
} from './int-test-helpers'
import { bossTokenItemId, EnumRaidDifficulty } from './raid-data'
import { RaidService } from './raid.service'

jest.setTimeout(120_000)

describe('boss raid', () => {
  const { wallet, monsters } = buildCore()
  const inventory = new InventoryService(dataSource, monsters)
  const equipment = new EquipmentService(dataSource, monsters, inventory, wallet)
  const raid = new RaidService(dataSource, monsters, inventory, wallet)
  let userId: string

  const tokens = async () => (await wallet.getBalance(userId)).raidToken
  const bossTokens = async (bossId: string) =>
    (await inventory.getInventory(userId)).items.find(
      item => item.itemId === bossTokenItemId(bossId)
    )?.quantity ?? 0
  // Pretend the raids so far happened two days ago, so the daily limit starts fresh.
  const newDay = () =>
    sql(
      `UPDATE monster_logs SET created_at = created_at - interval '2 days'
       WHERE monster_id IN (SELECT id FROM monsters WHERE owner_id = $1)`,
      [userId]
    )

  beforeAll(async () => {
    await startTestDatabase()
    // An ultimate form beats the Normal boss almost every time, so a win is easy to get.
    userId = await createUserWithMonster(monsters, 'ultimate', 'flame_ultimate', 'raid')
  })
  afterAll(stopTestDatabase)

  it('keeps young monsters and locked difficulties out', async () => {
    const baby = await createUserWithMonster(monsters, 'baby_2', 'flame_baby2', 'raid')
    await expect(raid.battle(baby, 'lava_king', EnumRaidDifficulty.NORMAL)).rejects.toThrow(
      /not strong enough/
    )
    await expect(raid.battle(userId, 'lava_king', EnumRaidDifficulty.HARD)).rejects.toThrow(
      /previous difficulty/
    )
    await expect(raid.battle(userId, 'nope', EnumRaidDifficulty.NORMAL)).rejects.toThrow(
      /not found/i
    )
  })

  it('pays tokens, a boss token and a guaranteed set piece for a first win', async () => {
    let won = false
    for (let attempt = 0; attempt < 6 && !won; attempt++) {
      await newDay()
      const result = await raid.battle(userId, 'lava_king', EnumRaidDifficulty.NORMAL)
      won = result.battle.won
      if (won) {
        expect(result.isFirstClear).toBe(true)
        expect(result.raidTokens).toBe(4) // 2 tokens, doubled for the first clear
        expect(result.drop).toMatchObject({ setId: 'blazing', grade: EnumEquipmentGrade.RARE })
      }
    }
    expect(won).toBe(true)
    expect(await tokens()).toBe(4)
    expect(await bossTokens('lava_king')).toBe(1)
    const [piece] = await sql<{ set_id: string; sub_stats: Record<string, number> }[]>(
      `SELECT set_id, sub_stats FROM equipment_items WHERE user_id=$1 AND set_id='blazing'`,
      [userId]
    )
    expect(piece.set_id).toBe('blazing')
    expect(Object.keys(piece.sub_stats).length).toBeGreaterThan(0)
  })

  it('does not count raid fights as monster wins or losses', async () => {
    const [monster] = await sql<{ wins: number; losses: number }[]>(
      `SELECT wins, losses FROM monsters WHERE owner_id=$1`,
      [userId]
    )
    expect(monster.wins + monster.losses).toBe(0)
  })

  it('allows exactly three raid fights a day however many arrive at once', async () => {
    await newDay()
    await sql(`UPDATE monsters SET stamina=100, fullness=4 WHERE owner_id=$1`, [userId])
    const burst = await Promise.allSettled(
      Array.from({ length: 8 }, () => raid.battle(userId, 'lava_king', EnumRaidDifficulty.NORMAL))
    )
    expect(succeeded(burst)).toBe(3)
    expect((await raid.getRaid(userId)).attemptsLeft).toBe(0)
  })

  it('refuses before fighting, and uses no daily try, when the equipment bag is full', async () => {
    await newDay()
    await sql(
      `INSERT INTO equipment_items (user_id, template_id, slot, grade, main_value)
       SELECT $1,'wooden_sword','weapon','common',4 FROM generate_series(1, 60)`,
      [userId]
    )
    const before = (await raid.getRaid(userId)).attemptsLeft
    await expect(raid.battle(userId, 'lava_king', EnumRaidDifficulty.NORMAL)).rejects.toThrow(
      /bag is full/
    )
    expect((await raid.getRaid(userId)).attemptsLeft).toBe(before)
    await sql(`DELETE FROM equipment_items WHERE user_id=$1 AND template_id='wooden_sword'`, [
      userId,
    ])
  })

  it('exchanges boss tokens once under a race, and not for a grade you have not unlocked', async () => {
    await dataSource.transaction(etm =>
      inventory.add(userId, bossTokenItemId('lava_king'), etm, 24)
    )
    // Earlier wins left a few tokens too: still enough for one rare piece (20) but not for two.
    const before = await bossTokens('lava_king')
    expect(before).toBeGreaterThanOrEqual(25)
    expect(before).toBeLessThan(40)
    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () =>
        raid.exchange(userId, 'lava_king', EnumEquipmentSlot.ARMOR, EnumEquipmentGrade.RARE)
      )
    )
    expect(succeeded(results)).toBe(1)
    expect(await bossTokens('lava_king')).toBe(before - 20)
    await expect(
      raid.exchange(userId, 'lava_king', EnumEquipmentSlot.ARMOR, EnumEquipmentGrade.EPIC)
    ).rejects.toThrow(/Clear this difficulty/)
    await expect(
      raid.exchange(userId, 'lava_king', EnumEquipmentSlot.ARMOR, EnumEquipmentGrade.RARE)
    ).rejects.toThrow(/Not enough boss tokens/)
  })

  it('sells protect scrolls for raid tokens and never lets the balance go negative', async () => {
    await sql(`UPDATE wallets SET raid_token = 3 WHERE user_id=$1`, [userId])
    await expect(equipment.buyMaterial(userId, EnumMaterialId.PROTECT_SCROLL)).rejects.toThrow(
      /raid tokens/
    )
    expect(await tokens()).toBe(3)
    await sql(`UPDATE wallets SET raid_token = 10 WHERE user_id=$1`, [userId])
    await equipment.buyMaterial(userId, EnumMaterialId.PROTECT_SCROLL)
    expect(await tokens()).toBe(4)
    await expect(
      sql(`UPDATE wallets SET raid_token = -1 WHERE user_id=$1`, [userId])
    ).rejects.toThrow()
  })

  it('reports the battle effect of a worn four-piece set', async () => {
    const wearer = await createUserWithMonster(monsters, 'adult', 'flame_adultGood', 'raid')
    await give(wearer, 0)
    for (const slot of Object.values(EnumEquipmentSlot)) {
      const row = await dataSource.transaction(etm =>
        grantItem(
          wearer,
          buildSetPiece(`tidal_guard_${slot}`, EnumEquipmentGrade.RARE),
          'test',
          etm
        )
      )
      await equipment.equip(wearer, (row as EquipmentItemEntity).id)
    }
    const view = await equipment.getEquipment(wearer)
    expect(view.activeEffects).toEqual({ shieldPct: 0.15 })
    expect(view.bonus.pct.def).toBeCloseTo(0.2)
  })
})
