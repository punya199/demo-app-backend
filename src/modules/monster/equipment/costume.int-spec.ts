// Runs against a real, throwaway Postgres via `yarn test:integration` (see int-test-helpers.ts).
import dataSource from '../../../config/database.config'
import { EnumMonsterLine } from '../../../db/entities/monster.entity'
import { EnumCostumeSlot } from './costume-data'
import { CostumeService, loadPublicCostumes } from './costume.service'
import { InventoryService } from '../inventory/inventory.service'
import { ProfileService } from '../core/profile.service'
import {
  buildCore,
  createUser,
  give,
  sql,
  startTestDatabase,
  stopTestDatabase,
  succeeded,
} from '../int-test-helpers'

jest.setTimeout(60_000)

describe('costume shop', () => {
  const { wallet, monsters } = buildCore()
  const inventory = new InventoryService(dataSource, monsters)
  const costumes = new CostumeService(
    dataSource,
    monsters,
    inventory,
    wallet,
    new ProfileService(dataSource)
  )
  let userId: string

  beforeAll(async () => {
    await startTestDatabase()
    userId = await createUser('costume')
    await monsters.hatch(userId, EnumMonsterLine.FLAME)
  })
  afterAll(stopTestDatabase)

  it('refuses a poor buyer without charging, then sells once and refuses a double purchase', async () => {
    await expect(costumes.buy(userId, 'cap')).rejects.toThrow()
    await give(userId, 1000)
    const state = await costumes.buy(userId, 'cap')
    expect(state.owned).toContain('cap')
    expect((await wallet.getBalance(userId)).coin).toBe(1000 - 150)
    await expect(costumes.buy(userId, 'cap')).rejects.toThrow(/already own/)
    expect((await wallet.getBalance(userId)).coin).toBe(1000 - 150)
  })

  it('charges only once when the same purchase arrives in parallel', async () => {
    await give(userId, 1000)
    const burst = await Promise.allSettled(
      Array.from({ length: 5 }, () => costumes.buy(userId, 'ribbon'))
    )
    expect(succeeded(burst)).toBe(1)
    expect((await wallet.getBalance(userId)).coin).toBe(1000 - 150)
  })

  it('never sells a season reward and refuses an unknown costume', async () => {
    await expect(costumes.buy(userId, 'rainbow')).rejects.toThrow(/reward/)
    await expect(costumes.buy(userId, 'nope')).rejects.toThrow(/not found/i)
  })

  it('equips only owned costumes in their own slot, per pet', async () => {
    await expect(costumes.equip(userId, 'crown')).rejects.toThrow(/do not own/)
    const state = await costumes.equip(userId, 'cap')
    const pet = state.pets.find(row => row.id === state.selectedId)!
    expect(pet.costume).toEqual({ hat: 'cap' })

    await monsters.hatch(userId, EnumMonsterLine.TIDE)
    const second = (await costumes.getState(userId)).pets.find(row => row.costume.hat !== 'cap')!
    expect(second.costume).toEqual({})
    const after = await costumes.unequip(userId, EnumCostumeSlot.HAT, second.id)
    expect(after.pets.find(row => row.id === state.selectedId)!.costume).toEqual({ hat: 'cap' })
  })

  it('shows others the selected pet only while sharing is on', async () => {
    const shown = await loadPublicCostumes([userId], dataSource.manager)
    expect(shown.get(userId)).toBeDefined()
    await costumes.setShowCostume(userId, false)
    expect((await loadPublicCostumes([userId], dataSource.manager)).has(userId)).toBe(false)
    await costumes.setShowCostume(userId, true)
    const [row] = await sql<{ show_costume: boolean }[]>(
      `SELECT show_costume FROM player_profiles WHERE user_id=$1`,
      [userId]
    )
    expect(row.show_costume).toBe(true)
  })
})
