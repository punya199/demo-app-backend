// Runs against a real, throwaway Postgres via `yarn test:integration` (see int-test-helpers.ts).
import { EnumMonsterLine } from '../../db/entities/monster.entity'
import { buildCore, createUser, sql, startTestDatabase, stopTestDatabase } from './int-test-helpers'
import { EnumMonsterAction } from './monster-engine'
import { MAX_LIVING_MONSTERS } from './monster-rules'

jest.setTimeout(60_000)

describe('monster slots', () => {
  const { monsters } = buildCore()
  let userId: string

  beforeAll(async () => {
    await startTestDatabase()
    userId = await createUser('slots')
  })
  afterAll(stopTestDatabase)

  it('raises up to the limit at once, and the newest egg is the selected one', async () => {
    for (let i = 0; i < MAX_LIVING_MONSTERS; i++) {
      await monsters.hatch(userId, EnumMonsterLine.FLAME)
    }
    const { monster, monsters: living } = await monsters.getMyMonster(userId)
    expect(living).toHaveLength(MAX_LIVING_MONSTERS)
    expect(monster?.id).toBe(living[0].id)
    await expect(monsters.hatch(userId, EnumMonsterLine.TIDE)).rejects.toThrow(/at most/)
  })

  it('selects another monster and cares for a specific one', async () => {
    const { monsters: living } = await monsters.getMyMonster(userId)
    const other = living[living.length - 1]
    await monsters.select(userId, other.id)
    expect((await monsters.getMyMonster(userId)).monster?.id).toBe(other.id)

    // The monsters are eggs, so a care action is refused - but it must target the one asked for.
    await expect(monsters.act(userId, EnumMonsterAction.FEED, living[1].id)).rejects.toThrow(/egg/)
  })

  it('refuses to select someone else’s monster', async () => {
    const stranger = await createUser('slots_other')
    const [{ id }] = await sql<{ id: string }[]>(
      `SELECT id FROM monsters WHERE owner_id=$1 LIMIT 1`,
      [userId]
    )
    await expect(monsters.select(stranger, id)).rejects.toThrow(/not found/i)
  })
})
