// Runs against a real, throwaway Postgres via `yarn test:integration` (see int-test-helpers.ts).
import dataSource from '../../config/database.config'
import {
  buildCore,
  createUser,
  createUserWithMonster,
  sql,
  startTestDatabase,
  stopTestDatabase,
  succeeded,
  withTimeout,
} from './int-test-helpers'
import { EnumMonsterLine } from '../../db/entities/monster.entity'
import { PVP_NPCS } from './pvp-data'
import { getSeason } from './pvp-season'
import { ProfileService } from './profile.service'
import { PvpService } from './pvp.service'

jest.setTimeout(120_000)

describe('async PvP arena', () => {
  const { wallet, monsters } = buildCore()
  const pvp = new PvpService(dataSource, monsters, wallet, new ProfileService(dataSource))
  // Looked up when used, not once up front: a test that straddles the Thai month change (midnight
  // on the 1st) must still agree with the service about which season it is.
  const currentSeason = () => getSeason(new Date())
  let a: string
  let b: string
  let c: string
  let aVsB: string

  beforeAll(async () => {
    await startTestDatabase()
    // The arena is global, so start from an empty one (this database is throwaway by the guard).
    await sql('DELETE FROM pvp_battles')
    await sql('DELETE FROM pvp_ratings')
    await sql('DELETE FROM pvp_defenses')
    a = await createUserWithMonster(monsters, 'adult', 'flame_adultGood', 'pvp')
    b = await createUserWithMonster(monsters, 'adult', 'flame_adultGood', 'pvp')
    c = await createUserWithMonster(monsters, 'adult', 'flame_adultGood', 'pvp')
  })
  afterAll(stopTestDatabase)

  it('needs a defense team to attack, and keeps young monsters out', async () => {
    await expect(pvp.battle(a, PVP_NPCS[0].id)).rejects.toThrow(/defense team/)
    const baby = await createUserWithMonster(monsters, 'baby_1', 'flame_baby2', 'pvp')
    await expect(pvp.setDefense(baby)).rejects.toThrow(/too young/)
  })

  it('sets a defense with a default non-identifying name, and enforces the cooldown', async () => {
    const mine = await pvp.setDefense(a)
    const named = await pvp.setDefense(b, 'Bee Arena')
    expect(mine.defense!.displayName).toMatch(/^ผู้ฝึก#[0-9a-f]{4}$/)
    expect(named.defense!.displayName).toBe('Bee Arena')
    await expect(pvp.setDefense(a)).rejects.toThrow(/recently/)
  })

  it('offers real players first, fills with same-form NPCs, and leaks no user ids', async () => {
    const { opponents } = await pvp.getOpponents(a)
    expect(opponents).toHaveLength(3)
    expect(opponents[0].isNpc).toBe(false)
    expect(
      opponents.slice(1).every(opponent => opponent.isNpc && opponent.id.startsWith('npc:adult:'))
    ).toBe(true)
    expect(JSON.stringify(opponents)).not.toContain(b)
  })

  it('rejects made-up, other-form and own opponent ids', async () => {
    await expect(pvp.battle(a, 'nope')).rejects.toThrow(/not available/)
    await expect(pvp.battle(a, '00000000-0000-0000-0000-000000000000')).rejects.toThrow(
      /not available/
    )
    await expect(
      pvp.battle(a, PVP_NPCS.find(npc => (npc.stage as string) === 'perfect')!.id)
    ).rejects.toThrow(/not available/)
    const [own] = await sql<{ id: string }[]>(`SELECT id FROM pvp_defenses WHERE user_id=$1`, [a])
    await expect(pvp.battle(a, own.id)).rejects.toThrow(/not available/)
  })

  it('moves both ratings, pays coins, leaves monster wins alone, and keeps history private', async () => {
    const { opponents } = await pvp.getOpponents(a)
    aVsB = opponents[0].id
    const coinBefore = (await wallet.getBalance(a)).coin
    const result = await pvp.battle(a, aVsB)
    const won = result.battle.won
    expect(result.rating.before).toBe(1000)

    const rating = async (userId: string) =>
      (
        await sql<{ rating: number }[]>(
          `SELECT rating FROM pvp_ratings WHERE user_id=$1 AND season=$2`,
          [userId, currentSeason()]
        )
      )[0].rating
    expect(await rating(a)).toBe(won ? 1016 : 984)
    expect(await rating(b)).toBe(won ? 992 : 1008)
    expect((await wallet.getBalance(a)).coin - coinBefore).toBe(won ? 15 : 3)

    const [monster] = await sql<{ wins: number; losses: number }[]>(
      `SELECT wins, losses FROM monsters WHERE owner_id=$1`,
      [a]
    )
    expect(monster.wins + monster.losses).toBe(0)

    const { battles } = await pvp.getHistory(b)
    expect(battles).toHaveLength(1)
    expect(battles[0]).toMatchObject({ role: 'defender', won: !won })
    expect(JSON.stringify(battles)).not.toContain(a)
    expect(JSON.stringify(battles)).not.toContain('username')
    expect((await pvp.getReplay(b, battles[0].id)).attackerWon).toBe(won)
    await expect(pvp.getReplay(c, battles[0].id)).rejects.toThrow(/not found/i)
  })

  it('lets one real defender be challenged at most twice a day', async () => {
    await pvp.battle(a, aVsB)
    await expect(pvp.battle(a, aVsB)).rejects.toThrow(/not available/)
  })

  it('does not deadlock when two players challenge each other at once', async () => {
    await pvp.setDefense(c)
    await sql(`DELETE FROM pvp_battles WHERE attacker_id IN ($1,$2)`, [a, b])
    const aTarget = (await pvp.getOpponents(a)).opponents.find(opponent => !opponent.isNpc)!
    const bTarget = (await pvp.getOpponents(b)).opponents.find(opponent => !opponent.isNpc)!
    await withTimeout(
      Promise.all(
        Array.from({ length: 4 }, (_, index) =>
          (index % 2 ? pvp.battle(a, aTarget.id) : pvp.battle(b, bTarget.id)).catch(() => 'x')
        )
      ),
      20_000
    )
  })

  it('allows exactly ten fights a day however many arrive at once', async () => {
    await sql(`DELETE FROM pvp_battles WHERE attacker_id=$1`, [a])
    const npc = PVP_NPCS.find(entry => (entry.stage as string) === 'adult')!.id
    const burst = await Promise.allSettled(Array.from({ length: 14 }, () => pvp.battle(a, npc)))
    expect(succeeded(burst)).toBe(10)
    expect((await pvp.getStatus(a)).attemptsLeft).toBe(0)
  })

  it('pays a finished season once under a race, by rank, and needs enough fights', async () => {
    await sql(
      `INSERT INTO pvp_ratings (user_id, season, rating, wins, losses)
       VALUES ($1,'2000-01',1200,5,2), ($2,'2000-01',1100,3,3), ($3,'2000-01',1300,1,0)`,
      [a, b, c]
    )
    expect((await pvp.getStatus(a)).claimableSeasons[0].rank).toBe(1)
    expect((await pvp.getStatus(c)).claimableSeasons).toHaveLength(0)
    await expect(pvp.claimSeason(a, currentSeason())).rejects.toThrow(/not ended/)
    await expect(pvp.claimSeason(c, '2000-01')).rejects.toThrow(/Not enough fights/)

    const before = await wallet.getBalance(a)
    const claims = await Promise.allSettled(
      Array.from({ length: 5 }, () => pvp.claimSeason(a, '2000-01'))
    )
    expect(succeeded(claims)).toBe(1)
    const after = await wallet.getBalance(a)
    expect([
      after.coin - before.coin,
      after.gem - before.gem,
      after.raidToken - before.raidToken,
    ]).toEqual([1000, 30, 20])
    const second = await pvp.claimSeason(b, '2000-01')
    expect([second.rank, second.reward.coin]).toEqual([2, 600])
  })

  it('starts a new season from half of last season’s distance from 1000', async () => {
    const d = await createUser('pvp')
    await sql(
      `INSERT INTO pvp_ratings (user_id, season, rating, wins, losses) VALUES ($1,'2000-01',1200,9,0)`,
      [d]
    )
    await monsters.hatch(d, EnumMonsterLine.FLAME)
    await sql(
      `UPDATE monsters SET stage='adult', species_id='flame_adultGood', fullness=4, strength=4, weight=30 WHERE owner_id=$1`,
      [d]
    )
    expect((await pvp.setDefense(d)).rating).toBe(1100)
  })

  it('exposes no user identifiers on the leaderboard', async () => {
    const { entries } = await pvp.getLeaderboard(a)
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.every(entry => !('userId' in entry) && !('username' in entry))).toBe(true)
  })
})
