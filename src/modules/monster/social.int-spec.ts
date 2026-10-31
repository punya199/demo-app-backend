// Runs against a real, throwaway Postgres via `yarn test:integration` (see int-test-helpers.ts).
import dataSource from '../../config/database.config'
import { FriendService } from './friend.service'
import { InventoryService } from './inventory.service'
import {
  buildCore,
  createUser,
  createUserWithMonster,
  give,
  sql,
  startTestDatabase,
  stopTestDatabase,
  succeeded,
  withTimeout,
} from './int-test-helpers'
import { ProfileService } from './profile.service'
import { EnumShopItemId } from './shop-data'
import { SupportService } from './support.service'
import { getWeek } from './world-boss-data'
import { WorldBossService } from './world-boss.service'

jest.setTimeout(120_000)

describe('profiles, friends and rental', () => {
  const { wallet, monsters } = buildCore()
  const inventory = new InventoryService(dataSource, monsters)
  const profiles = new ProfileService(dataSource)
  const friends = new FriendService(dataSource, profiles, inventory, monsters)
  const support = new SupportService(dataSource, monsters, profiles)
  const worldBoss = new WorldBossService(dataSource, monsters, inventory, wallet)
  const currentWeek = () => getWeek(new Date()).key

  const player = async (name?: string) => {
    const id = await createUserWithMonster(monsters, 'ultimate', 'flame_ultimate', 'soc')
    const profile = await profiles.ensureProfile(id)
    if (name) {
      await profiles.setDisplayName(id, name)
    }
    return { id, code: profile.friendCode }
  }
  const befriend = async (a: { id: string; code: string }, b: { id: string; code: string }) => {
    await friends.request(a.id, b.code)
    const incoming = (await friends.list(b.id)).incoming[0]
    await friends.respond(b.id, incoming.relationId, true)
    return (await friends.list(a.id)).friends.find(entry => entry.displayName)!.relationId
  }
  const username = async (id: string) =>
    (await sql<{ username: string }[]>(`SELECT username FROM users WHERE id=$1`, [id]))[0].username

  beforeAll(async () => {
    await startTestDatabase()
    await sql('DELETE FROM rentals')
    await sql('DELETE FROM world_boss_damage')
    await sql('DELETE FROM world_bosses')
  })
  afterAll(stopTestDatabase)

  describe('profiles', () => {
    it('creates one profile per player with a unique friend code, even when asked in parallel', async () => {
      const id = await createUser('soc')
      const results = await Promise.all(Array.from({ length: 8 }, () => profiles.ensureProfile(id)))
      expect(new Set(results.map(profile => profile.friendCode)).size).toBe(1)
      const [count] = await sql<{ c: number }[]>(
        `SELECT count(*)::int c FROM player_profiles WHERE user_id=$1`,
        [id]
      )
      expect(count.c).toBe(1)
      expect(results[0].displayName).toMatch(/^ผู้ฝึก#[0-9a-f]{4}$/)
    })

    it('keeps a name once it has been chosen', async () => {
      const id = await createUser('soc')
      await profiles.setDisplayName(id, 'Chosen Name')
      expect((await profiles.ensureProfile(id)).displayName).toBe('Chosen Name')
    })
  })

  describe('migration', () => {
    it('moves existing arena names into profiles with valid friend codes, and back on down()', async () => {
      const runner = dataSource.createQueryRunner()
      await runner.startTransaction()
      try {
        const migration = dataSource.migrations.find(entry => entry.name?.startsWith('AddSocial'))!
        await migration.down(runner)
        // the world as it was before this migration: the arena name lives on the defense row
        const [user] = (await runner.query(
          `INSERT INTO users (username, password) VALUES ('mig_' || floor(random()*1e9), 'x') RETURNING id`
        )) as { id: string }[]
        await runner.query(
          `INSERT INTO pvp_defenses (user_id, display_name, fighter, stage, species_id, set_at)
           VALUES ($1, 'Old Arena Name', '{}', 'adult', 'flame_adultGood', now())`,
          [user.id]
        )
        await migration.up(runner)
        const [profile] = (await runner.query(
          `SELECT display_name, friend_code FROM player_profiles WHERE user_id=$1`,
          [user.id]
        )) as { display_name: string; friend_code: string }[]
        expect(profile.display_name).toBe('Old Arena Name')
        expect(profile.friend_code).toMatch(/^[A-HJ-KM-NP-Z2-9]{8}$/)
        expect(await runner.hasColumn('pvp_defenses', 'display_name')).toBe(false)
      } finally {
        await runner.rollbackTransaction()
        await runner.release()
      }
    })
  })

  describe('friends', () => {
    it('asks by code only, meets a crossing request, and rejects self, junk and unknown codes', async () => {
      const a = await player('Ann')
      const b = await player('Bob')
      await expect(friends.request(a.id, a.code)).rejects.toThrow(/yourself/)
      await expect(friends.request(a.id, 'nope')).rejects.toThrow(/Invalid friend code/)
      await expect(friends.request(a.id, 'ZZZZZZZZ')).rejects.toThrow(/not found/)

      // both ask at the same time: one row, and they end up friends
      const results = await Promise.allSettled([
        friends.request(a.id, b.code),
        friends.request(b.id, a.code),
      ])
      expect(succeeded(results)).toBeGreaterThanOrEqual(1)
      const [rows] = await sql<{ c: number; accepted: number }[]>(
        `SELECT count(*)::int c, count(*) FILTER (WHERE status='accepted')::int accepted
         FROM friendships WHERE user_low = LEAST($1::uuid,$2::uuid) AND user_high = GREATEST($1::uuid,$2::uuid)`,
        [a.id, b.id]
      )
      expect(rows.c).toBe(1)
      await expect(friends.request(a.id, b.code)).rejects.toThrow(/Already friends|already sent/)
    })

    it('shows friends only by profile name and relation id, never by user id or username', async () => {
      const a = await player('Ann2')
      const b = await player('Bob2')
      const relation = await befriend(a, b)
      const seenByA = JSON.stringify([
        await friends.list(a.id),
        await friends.visit(a.id, relation),
        await support.getRentable(a.id),
      ])
      for (const secret of [b.id, await username(b.id)]) {
        expect(seenByA).not.toContain(secret)
      }
      expect(seenByA).toContain('Bob2')
      // a stranger can't open someone else's friendship
      const stranger = await player()
      await expect(friends.visit(stranger.id, relation)).rejects.toThrow(/not found/i)
      await expect(friends.greet(stranger.id, relation)).rejects.toThrow(/not found/i)
    })

    it('lets a pending request be declined, and either side end a friendship', async () => {
      const a = await player()
      const b = await player()
      await friends.request(a.id, b.code)
      const request = (await friends.list(b.id)).incoming[0]
      await expect(friends.respond(a.id, request.relationId, true)).rejects.toThrow(/not found/i)
      await friends.respond(b.id, request.relationId, false)
      expect((await friends.list(a.id)).outgoing).toHaveLength(0)
      const relation = await befriend(a, b)
      await friends.remove(b.id, relation)
      expect((await friends.list(a.id)).friends).toHaveLength(0)
    })

    it('stops at the friend and pending-request limits', async () => {
      const target = await player()
      const askers = await Promise.all(Array.from({ length: 21 }, () => player()))
      const results: PromiseSettledResult<unknown>[] = []
      for (const asker of askers) {
        results.push(...(await Promise.allSettled([friends.request(asker.id, target.code)])))
      }
      expect(succeeded(results)).toBe(20)
      expect(((results[20] as PromiseRejectedResult).reason as Error).message).toMatch(
        /too many pending/
      )
    })

    it('allows one greeting a day per friend, even when sent in parallel', async () => {
      const a = await player()
      const b = await player()
      const relation = await befriend(a, b)
      const results = await Promise.allSettled(
        Array.from({ length: 4 }, () => friends.greet(a.id, relation))
      )
      expect(succeeded(results)).toBe(1)
      expect((await friends.list(a.id)).friends[0].points).toBe(1)
      await expect(friends.greet(a.id, relation)).rejects.toThrow(/already greeted/)
      // the friend can still greet back
      await friends.greet(b.id, relation)
    })

    it('gifts only what the sender owns, three a day, moving the item and adding points', async () => {
      const a = await player()
      const b = await player()
      const relation = await befriend(a, b)
      await expect(friends.gift(a.id, relation, EnumShopItemId.PROTEIN)).rejects.toThrow(
        /do not have this item/
      )
      await dataSource.transaction(etm => inventory.add(a.id, EnumShopItemId.PROTEIN, etm, 5))
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () => friends.gift(a.id, relation, EnumShopItemId.PROTEIN))
      )
      expect(succeeded(results)).toBe(3)
      const owned = async (id: string) =>
        (await inventory.getInventory(id)).items.find(item => item.itemId === 'protein')
          ?.quantity ?? 0
      expect(await owned(a.id)).toBe(2)
      expect(await owned(b.id)).toBe(3)
      expect((await friends.list(a.id)).friends[0].points).toBe(6)
    })
  })

  describe('support units and rental', () => {
    it('sets a support unit with a cooldown and offers it only to friends', async () => {
      const owner = await player('Owner')
      const friend = await player('Friend')
      const stranger = await player('Stranger')
      await support.setSupport(owner.id)
      await expect(support.setSupport(owner.id)).rejects.toThrow(/recently/)
      await befriend(owner, friend)
      expect((await support.getRentable(friend.id)).units).toHaveLength(1)
      expect((await support.getRentable(stranger.id)).units).toHaveLength(0)
      const baby = await createUserWithMonster(monsters, 'baby_1', 'flame_baby2', 'soc')
      await expect(support.setSupport(baby)).rejects.toThrow(/too young/)
    })

    it('rents a friend’s unit: the renter pays the owner, the ally damages the boss but not the renter’s rank', async () => {
      const owner = await player('RentOwner')
      const renter = await player('Renter')
      await befriend(owner, renter)
      await support.setSupport(owner.id)
      const { units } = await support.getRentable(renter.id)
      await give(renter.id, 100)
      const ownerBefore = (await wallet.getBalance(owner.id)).coin

      const result = await worldBoss.attack(renter.id, units[0].supportId)
      expect(result.ally).toMatchObject({ fee: 20 })
      expect(result.ally!.damage).toBeGreaterThan(0)
      expect((await wallet.getBalance(renter.id)).coin).toBe(80)
      expect((await wallet.getBalance(owner.id)).coin - ownerBefore).toBe(20)
      const [row] = await sql<{ damage: number; hits: number }[]>(
        `SELECT d.damage, d.hits FROM world_boss_damage d JOIN world_bosses b ON b.id=d.world_boss_id
         WHERE b.week=$1 AND d.user_id=$2`,
        [currentWeek(), renter.id]
      )
      expect(row.damage).toBe(result.damage) // the renter's own damage only
      const [lost] = await sql<{ lost: number }[]>(
        `SELECT (max_hp - hp) AS lost FROM world_bosses WHERE week=$1`,
        [currentWeek()]
      )
      const [credited] = await sql<{ total: number }[]>(
        `SELECT (COALESCE((SELECT SUM(d.damage) FROM world_boss_damage d JOIN world_bosses b ON b.id=d.world_boss_id WHERE b.week=$1),0)
               + COALESCE((SELECT SUM(r.ally_damage) FROM rentals r JOIN world_bosses b ON b.id=r.world_boss_id WHERE b.week=$1),0))::int AS total`,
        [currentWeek()]
      )
      expect(lost.lost).toBe(credited.total) // every point of HP lost is someone's damage or an ally's
      // friendship points for renting
      const list = await friends.list(owner.id)
      expect(list.friends[0].points).toBeGreaterThanOrEqual(3)
    })

    it('refuses a unit that is not a friend’s, your own, or does not exist, with the same answer', async () => {
      const owner = await player()
      const stranger = await player()
      await support.setSupport(owner.id)
      const [unit] = await sql<{ id: string }[]>(`SELECT id FROM support_units WHERE user_id=$1`, [
        owner.id,
      ])
      await give(stranger.id, 100)
      await expect(worldBoss.attack(stranger.id, unit.id)).rejects.toThrow(/not available/)
      await expect(worldBoss.attack(owner.id, unit.id)).rejects.toThrow(/not available/)
      await expect(
        worldBoss.attack(stranger.id, '00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow(/not available/)
      await expect(worldBoss.attack(stranger.id, 'junk')).rejects.toThrow(/not available/)
    })

    it('refuses a renter who cannot pay, without fighting or charging', async () => {
      const owner = await player()
      const broke = await player()
      await befriend(owner, broke)
      await support.setSupport(owner.id)
      const { units } = await support.getRentable(broke.id)
      await expect(worldBoss.attack(broke.id, units[0].supportId)).rejects.toThrow(
        /Not enough coins/
      )
      const [state] = await sql<{ stamina: number }[]>(
        `SELECT stamina FROM monsters WHERE owner_id=$1`,
        [broke.id]
      )
      expect(state.stamina).toBe(100)
      expect((await worldBoss.getStatus(broke.id)).hitsLeft).toBe(3)
    })

    it('caps what one owner earns a day, charging the renter only what the owner can still take', async () => {
      const owner = await player()
      const renter = await player()
      await befriend(owner, renter)
      await support.setSupport(owner.id)
      const { units } = await support.getRentable(renter.id)
      await give(renter.id, 1000)
      // the owner is 10 coins short of the 200 cap
      await sql(
        `INSERT INTO rentals (renter_id, owner_id, support_unit_id, world_boss_id, fee, ally_damage)
         SELECT $1, $2, $3, id, 190, 0 FROM world_bosses WHERE week=$4`,
        [renter.id, owner.id, units[0].supportId, currentWeek()]
      )
      const before = (await wallet.getBalance(renter.id)).coin
      const first = await worldBoss.attack(renter.id, units[0].supportId)
      expect(first.ally!.fee).toBe(10)
      expect(before - (await wallet.getBalance(renter.id)).coin).toBe(10)
      const second = await worldBoss.attack(renter.id, units[0].supportId)
      expect(second.ally!.fee).toBe(0) // the owner is at the cap: free
      expect((await wallet.getBalance(renter.id)).coin).toBe(before - 10)
    })

    it('does not deadlock when two friends rent from each other at the same time', async () => {
      const a = await player()
      const b = await player()
      await befriend(a, b)
      await support.setSupport(a.id)
      await support.setSupport(b.id)
      await give(a.id, 500)
      await give(b.id, 500)
      const unitOf = async (viewer: { id: string }) =>
        (await support.getRentable(viewer.id)).units[0].supportId
      const [forA, forB] = [await unitOf(a), await unitOf(b)]
      await withTimeout(
        Promise.all(
          Array.from({ length: 6 }, (_, index) =>
            (index % 2 ? worldBoss.attack(a.id, forA) : worldBoss.attack(b.id, forB)).catch(
              () => 'x'
            )
          )
        ),
        20_000
      )
    })
  })
})
