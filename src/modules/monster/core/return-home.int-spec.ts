// Runs against a real, throwaway Postgres via `yarn test:integration` (see int-test-helpers.ts).
import dataSource from '../../../config/database.config'
import { InventoryService } from '../inventory/inventory.service'
import {
  buildCore,
  createUser,
  createUserWithMonster,
  sql,
  startTestDatabase,
  stopTestDatabase,
} from '../int-test-helpers'
import { petCoreItemId } from './pet-core'

jest.setTimeout(60_000)

describe('return home (กลับดาว)', () => {
  const { monsters } = buildCore()
  const inventory = new InventoryService(dataSource, monsters)

  beforeAll(startTestDatabase)
  afterAll(stopTestDatabase)

  const core = async (userId: string, speciesId: string) =>
    (await inventory.getInventory(userId)).items.find(
      item => item.itemId === petCoreItemId(speciesId)
    )?.quantity ?? 0

  it('sends a perfect pet away for one core, returns its gear and frees the slot', async () => {
    const userId = await createUserWithMonster(monsters, 'perfect', 'flame_perfectGood', 'home')
    const { monster } = await monsters.getMyMonster(userId)
    await sql(
      `INSERT INTO equipment_items (user_id, template_id, slot, grade, main_value, equipped, monster_id)
       VALUES ($1,'wooden_sword','weapon','common',4,true,$2)`,
      [userId, monster!.id]
    )

    const result = await monsters.returnHome(userId, monster!.id)

    expect(result).toEqual({ itemId: petCoreItemId('flame_perfectGood'), quantity: 1 })
    expect(await core(userId, 'flame_perfectGood')).toBe(1)
    const after = await monsters.getMyMonster(userId)
    expect(after.monsters).toHaveLength(0)
    const [row] = await sql<{ death_cause: string }[]>(
      `SELECT death_cause FROM monsters WHERE id=$1`,
      [monster!.id]
    )
    expect(row.death_cause).toBe('returned')
    const [gear] = await sql<{ equipped: boolean; monster_id: string | null }[]>(
      `SELECT equipped, monster_id FROM equipment_items WHERE user_id=$1`,
      [userId]
    )
    expect(gear).toEqual({ equipped: false, monster_id: null })
  })

  it('stacks cores of the same species and keeps other species apart', async () => {
    const userId = await createUserWithMonster(monsters, 'perfect', 'flame_perfectGood', 'stack')
    const first = (await monsters.getMyMonster(userId)).monster!
    await monsters.returnHome(userId, first.id)
    await monsters.hatch(userId, first.line)
    await sql(
      `UPDATE monsters SET stage='perfect', species_id='flame_perfectGood' WHERE owner_id=$1 AND died_at IS NULL`,
      [userId]
    )
    const second = (await monsters.getMyMonster(userId)).monster!
    await monsters.returnHome(userId, second.id)
    expect(await core(userId, 'flame_perfectGood')).toBe(2)
    expect(await core(userId, 'flame_perfectAlt')).toBe(0)
  })

  it('refuses an adult, someone else’s monster and a monster on an expedition', async () => {
    const adultOwner = await createUserWithMonster(monsters, 'adult', 'flame_adultGood', 'adult')
    const adult = (await monsters.getMyMonster(adultOwner)).monster!
    await expect(monsters.returnHome(adultOwner, adult.id)).rejects.toThrow(/perfect form/)

    const owner = await createUserWithMonster(monsters, 'perfect', 'flame_perfectGood', 'own')
    const mine = (await monsters.getMyMonster(owner)).monster!
    const stranger = await createUser('stranger')
    await expect(monsters.returnHome(stranger, mine.id)).rejects.toThrow(/not found/i)

    await sql(`UPDATE monsters SET expedition_area_id='forest' WHERE id=$1`, [mine.id])
    await expect(monsters.returnHome(owner, mine.id)).rejects.toThrow(/expedition/)
    expect(await core(owner, 'flame_perfectGood')).toBe(0)
  })
})
