// Runs against a real, throwaway Postgres via `yarn test:integration` (see int-test-helpers.ts).
import dataSource from '../../config/database.config'
import { EquipmentItemEntity } from '../../db/entities/equipment-item.entity'
import { EnhanceService } from './enhance.service'
import { EnumEquipmentGrade, EnumEquipmentSlot, EnumMaterialId } from './equipment-data'
import { EquipmentService, grantEquipment } from './equipment.service'
import { InventoryService } from './inventory.service'
import {
  buildCore,
  createUser,
  give,
  sql,
  startTestDatabase,
  stopTestDatabase,
  succeeded,
} from './int-test-helpers'

jest.setTimeout(120_000)

describe('equipment and enhancing', () => {
  const { wallet, monsters } = buildCore()
  const inventory = new InventoryService(dataSource, monsters)
  const equipment = new EquipmentService(dataSource, monsters, inventory, wallet)
  const enhance = new EnhanceService(dataSource, equipment, inventory, wallet)
  let userId: string
  let first: EquipmentItemEntity
  let second: EquipmentItemEntity

  const quantity = async (itemId: string) =>
    (await inventory.getInventory(userId)).items.find(item => item.itemId === itemId)?.quantity ?? 0
  const grant = async (grade: EnumEquipmentGrade) =>
    (await dataSource.transaction(etm => grantEquipment(userId, grade, 'test', etm)))!

  beforeAll(async () => {
    await startTestDatabase()
    userId = await createUser('equip')
  })
  afterAll(stopTestDatabase)

  it('sells a box for coins and refuses (without charging) when the buyer is poor', async () => {
    await expect(equipment.buyBox(userId)).rejects.toThrow()
    expect((await equipment.getEquipment(userId)).items).toHaveLength(0)
    await give(userId, 1000)
    const box = await equipment.buyBox(userId)
    expect((await wallet.getBalance(userId)).coin).toBe(1000 - 120)
    expect(box.item.slot).toBeDefined()
  })

  it('wears one piece per slot and will not dismantle a worn piece', async () => {
    first = await grant(EnumEquipmentGrade.COMMON)
    second = await grant(EnumEquipmentGrade.RARE)
    await sql(`UPDATE equipment_items SET slot='weapon' WHERE id = ANY($1)`, [
      [first.id, second.id],
    ])
    await equipment.equip(userId, first.id)
    await equipment.equip(userId, second.id)
    const worn = (await equipment.getEquipment(userId)).items.filter(item => item.equipped)
    expect(worn.map(item => item.id)).toEqual([second.id])
    await expect(equipment.dismantle(userId, second.id)).rejects.toThrow(/Take the equipment off/)
    await equipment.unequip(userId, EnumEquipmentSlot.WEAPON)
  })

  it('enhances concurrently only as far as the stones go', async () => {
    await give(userId, 100_000, 50)
    await sql(`DELETE FROM inventory_items WHERE user_id=$1`, [userId])
    await dataSource.transaction(etm => inventory.add(userId, EnumMaterialId.ENHANCE_STONE, etm, 3))
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => enhance.enhance(userId, first.id, false))
    )
    expect(succeeded(results)).toBe(3)
    expect(await quantity('enhance_stone')).toBe(0)
    const [row] = await sql<{ enhance_level: number }[]>(
      `SELECT enhance_level FROM equipment_items WHERE id=$1`,
      [first.id]
    )
    expect(row.enhance_level).toBe(3)
    const [logs] = await sql<{ c: number }[]>(
      `SELECT count(*)::int c FROM enhance_logs WHERE equipment_id=$1`,
      [first.id]
    )
    expect(logs.c).toBe(3)
  })

  it('takes a protect scroll before the roll, so a missing scroll costs nothing', async () => {
    await sql(`UPDATE equipment_items SET enhance_level=10, pity=0 WHERE id=$1`, [first.id])
    await dataSource.transaction(etm =>
      inventory.add(userId, EnumMaterialId.ENHANCE_STONE, etm, 100)
    )
    const coinBefore = (await wallet.getBalance(userId)).coin
    await expect(enhance.enhance(userId, first.id, true)).rejects.toThrow(/protect scroll/)
    expect((await wallet.getBalance(userId)).coin).toBe(coinBefore)
    expect(await quantity('enhance_stone')).toBe(100)

    await dataSource.transaction(etm =>
      inventory.add(userId, EnumMaterialId.PROTECT_SCROLL, etm, 20)
    )
    let protectedFails = 0
    for (let attempt = 0; attempt < 15; attempt++) {
      await sql(`UPDATE equipment_items SET enhance_level=10 WHERE id=$1`, [first.id])
      const outcome = await enhance.enhance(userId, first.id, true)
      protectedFails += outcome.result.protectUsed ? 1 : 0
      expect(outcome.result.broke).toBe(false)
      if (!outcome.result.success) {
        expect(outcome.result.toLevel).toBe(10)
      }
    }
    expect(await quantity('protect_scroll')).toBe(20 - protectedFails)
  })

  it('soft-deletes a piece that breaks', async () => {
    let broke = false
    for (let attempt = 0; attempt < 400 && !broke; attempt++) {
      await sql(`UPDATE equipment_items SET enhance_level=14 WHERE id=$1 AND deleted_at IS NULL`, [
        first.id,
      ])
      try {
        broke = (await enhance.enhance(userId, first.id, false)).result.broke
      } catch {
        break
      }
    }
    expect(broke).toBe(true)
    expect(
      await dataSource.manager.findOne(EquipmentItemEntity, { where: { id: first.id } })
    ).toBeNull()
  })

  it('dismantles into stones and refuses a box when the bag is full, without charging', async () => {
    const epic = await grant(EnumEquipmentGrade.EPIC)
    const before = await quantity('enhance_stone')
    await equipment.dismantle(userId, epic.id)
    expect((await quantity('enhance_stone')) - before).toBe(8)

    await sql(
      `INSERT INTO equipment_items (user_id, template_id, slot, grade, main_value)
       SELECT $1,'wooden_sword','weapon','common',4 FROM generate_series(1, 60)`,
      [userId]
    )
    const coin = (await wallet.getBalance(userId)).coin
    await expect(equipment.buyBox(userId)).rejects.toThrow(/full/)
    expect((await wallet.getBalance(userId)).coin).toBe(coin)
  })
})
