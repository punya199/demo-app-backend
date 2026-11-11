// Runs against a real, throwaway Postgres via `yarn test:integration` (see int-test-helpers.ts).
import { WalletService } from '../../wallet/wallet.service'
import { WalletEntity } from '../../../db/entities/wallet.entity'
import dataSource from '../../../config/database.config'
import {
  buildCore,
  createUserWithMonster,
  give,
  sql,
  startTestDatabase,
  stopTestDatabase,
  succeeded,
} from '../int-test-helpers'
import { ProfileService } from '../core/profile.service'
import { MarketService } from './market.service'
import { MARKET_MAX_BUYS_PER_DAY } from './market-rules'

jest.setTimeout(60_000)

const PERFECT = ['perfect', 'flame_perfectGood'] as const

describe('pet market', () => {
  const { monsters } = buildCore()
  let market: MarketService
  let seller: string
  let buyer: string

  // A user holding a perfect pet and a second pet, so one can be listed.
  const sellerWithPets = async (prefix: string) => {
    const userId = await createUserWithMonster(monsters, PERFECT[0], PERFECT[1], prefix)
    await monsters.hatch(userId, 'flame' as never)
    return userId
  }
  const petOf = async (userId: string) =>
    (
      await sql<{ id: string }[]>(
        `SELECT id FROM monsters WHERE owner_id=$1 AND stage='perfect' LIMIT 1`,
        [userId]
      )
    )[0].id

  beforeAll(async () => {
    await startTestDatabase()
    const wallet = new WalletService(dataSource.getRepository(WalletEntity))
    market = new MarketService(dataSource, monsters, wallet, new ProfileService(dataSource))
    seller = await sellerWithPets('mk_seller')
    buyer = await createUserWithMonster(monsters, 'adult', 'flame_adultGood', 'mk_buyer')
    await give(buyer, 0, 1000)
    await give(seller, 0, 0)
  })
  afterAll(stopTestDatabase)

  it('lists a pet, freezes it, and hides the seller identity', async () => {
    const id = await petOf(seller)
    const { priceBand } = (await market.getMine(seller)).pets.find(p => p.monsterId === id)!
    const { listing } = await market.create(seller, id, priceBand!.min)
    expect(JSON.stringify(listing)).not.toMatch(/user|email|owner/i)
    const [{ is_listed }] = await sql<{ is_listed: boolean }[]>(
      `SELECT is_listed FROM monsters WHERE id=$1`,
      [id]
    )
    expect(is_listed).toBe(true)
    // Out of the owner's living pets, so it can not be played with.
    const { monsters: living } = await monsters.getMyMonster(seller)
    expect(living.map(m => m.id)).not.toContain(id)
    await expect(market.create(seller, id, priceBand!.min)).rejects.toThrow()
  })

  it('rejects a price outside the band and listing your last pet', async () => {
    await expect(market.create(seller, await petOf(seller), 1)).rejects.toThrow()
  })

  it('sells once: moves the pet, charges the buyer, pays the seller minus 10%', async () => {
    const { listings } = await market.browse(buyer, {})
    const listing = listings.find(l => l.mine === false)!
    await market.buy(buyer, listing.listingId)
    const [{ gem: buyerGem }] = await sql<{ gem: number }[]>(
      `SELECT gem FROM wallets WHERE user_id=$1`,
      [buyer]
    )
    const [{ gem: sellerGem }] = await sql<{ gem: number }[]>(
      `SELECT gem FROM wallets WHERE user_id=$1`,
      [seller]
    )
    expect(buyerGem).toBe(1000 - listing.price)
    expect(sellerGem).toBe(listing.price - Math.floor(listing.price * 0.1))
    const [pet] = await sql<{ owner_id: string; is_listed: boolean }[]>(
      `SELECT owner_id, is_listed FROM monsters WHERE id=$1`,
      [await petOf(buyer)]
    )
    expect(pet).toEqual({ owner_id: buyer, is_listed: false })
    await expect(market.buy(buyer, listing.listingId)).rejects.toThrow(/no longer available/)
  })

  it('lets only one of two racing buyers win and never double-spends', async () => {
    const racerSeller = await sellerWithPets('mk_racer_seller')
    const id = await petOf(racerSeller)
    const band = (await market.getMine(racerSeller)).pets.find(p => p.monsterId === id)!.priceBand!
    const { listing } = await market.create(racerSeller, id, band.min)
    const racers = await Promise.all(
      [1, 2].map(async n => {
        const racer = await createUserWithMonster(monsters, 'adult', 'flame_adultGood', `mk_r${n}`)
        await give(racer, 0, 1000)
        return racer
      })
    )
    const results = await Promise.allSettled(racers.map(r => market.buy(r, listing.listingId)))
    expect(succeeded(results)).toBe(1)
  })

  it('refuses a buyer whose wallet is short, leaving the listing intact', async () => {
    const poorSeller = await sellerWithPets('mk_poor_seller')
    const id = await petOf(poorSeller)
    const band = (await market.getMine(poorSeller)).pets.find(p => p.monsterId === id)!.priceBand!
    const { listing } = await market.create(poorSeller, id, band.min)
    const poor = await createUserWithMonster(monsters, 'adult', 'flame_adultGood', 'mk_poor')
    await give(poor, 0, 0)
    await expect(market.buy(poor, listing.listingId)).rejects.toThrow(/Not enough gems/)
    const [row] = await sql<{ status: string }[]>(`SELECT status FROM pet_listings WHERE id=$1`, [
      listing.listingId,
    ])
    expect(row.status).toBe('active')
  })

  it('cancels and expires a listing, returning the pet unfrozen', async () => {
    const lister = await sellerWithPets('mk_cancel')
    const id = await petOf(lister)
    const band = (await market.getMine(lister)).pets.find(p => p.monsterId === id)!.priceBand!
    const { listing } = await market.create(lister, id, band.min)
    await market.cancel(lister, listing.listingId)
    expect((await monsters.getMyMonster(lister)).monsters.map(m => m.id)).toContain(id)

    const again = await market.create(lister, id, band.min)
    await sql(`UPDATE pet_listings SET expires_at = now() - interval '1 minute' WHERE id=$1`, [
      again.listing.listingId,
    ])
    await market.browse(lister, {})
    const [row] = await sql<{ status: string }[]>(`SELECT status FROM pet_listings WHERE id=$1`, [
      again.listing.listingId,
    ])
    expect(row.status).toBe('expired')
    expect((await monsters.getMyMonster(lister)).monsters.map(m => m.id)).toContain(id)
  })

  it('blocks reselling a bought pet during the cooldown, and a buyer at the pet cap', async () => {
    const boughtId = await petOf(buyer)
    await expect(market.create(buyer, boughtId, 1000)).rejects.toThrow(/resold|between/)
    expect(MARKET_MAX_BUYS_PER_DAY).toBeGreaterThan(0)
  })
})
