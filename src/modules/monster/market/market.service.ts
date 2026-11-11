import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { DataSource, EntityManager, In, LessThanOrEqual, MoreThan } from 'typeorm'
import { MonsterEntity } from '../../../db/entities/monster.entity'
import { EnumPetListingStatus, PetListingEntity } from '../../../db/entities/pet-listing.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../../db/entities/wallet-transaction.entity'
import { WalletService } from '../../wallet/wallet.service'
import { averageRoll, potentialGrade } from '../core/monster-potential'
import { MAX_LIVING_MONSTERS } from '../core/monster-rules'
import { MonsterService } from '../core/monster.service'
import { ProfileService } from '../core/profile.service'
import { getSpecies } from '../core/species-data'
import { releasePet, toMonsterView } from '../core/monster-view'
import { EnumMarketSort } from '../dto/market.dto'
import {
  listingBlocker,
  MARKET_DAY_MS,
  MARKET_LISTING_MS,
  MARKET_MAX_ACTIVE_LISTINGS,
  MARKET_MAX_BUYS_PER_DAY,
  MARKET_NEUTRAL_HEARTS,
  MARKET_RESALE_COOLDOWN_MS,
  marketFee,
  priceBand,
  referenceValue,
} from './market-rules'

const BROWSE_LIMIT = 100
const HISTORY_LIMIT = 20
const REAP_BATCH = 50

const ORDER = {
  [EnumMarketSort.NEWEST]: { createdAt: 'DESC' },
  [EnumMarketSort.PRICE_ASC]: { price: 'ASC', createdAt: 'DESC' },
  [EnumMarketSort.PRICE_DESC]: { price: 'DESC', createdAt: 'DESC' },
} as const

// What a buyer may see of a pet. Never the monster id or owner: listings are addressed by listing id
// and the seller is shown by display name only (PDPA).
const toPetView = (pet: MonsterEntity) => {
  const species = getSpecies(pet.speciesId)
  return {
    speciesId: species.id,
    name: species.name,
    emoji: species.emoji,
    sprite: species.sprite,
    line: pet.line,
    stage: pet.stage,
    nickname: pet.nickname,
    wins: pet.wins,
    losses: pet.losses,
    ageMinutes: pet.ageMinutes,
    potential: pet.potential,
    potentialGrade: pet.potential ? potentialGrade(pet.potential) : null,
    potentialAverage: pet.potential ? Math.round(averageRoll(pet.potential) * 1000) / 10 : null,
    referenceValue: referenceValue(pet.stage, pet.line, pet.potential),
  }
}

@Injectable()
export class MarketService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly monsterService: MonsterService,
    private readonly walletService: WalletService,
    private readonly profileService: ProfileService
  ) {}

  async browse(
    userId: string,
    filter: { line?: MonsterEntity['line']; stage?: MonsterEntity['stage']; sort?: EnumMarketSort }
  ) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      await this.reapExpired(now, etm)
      const query = etm
        .createQueryBuilder(PetListingEntity, 'listing')
        .innerJoin(MonsterEntity, 'pet', 'pet.id = listing.monsterId')
        .where('listing.status = :status', { status: EnumPetListingStatus.ACTIVE })
      if (filter.line) {
        query.andWhere('pet.line = :line', { line: filter.line })
      }
      if (filter.stage) {
        query.andWhere('pet.stage = :stage', { stage: filter.stage })
      }
      const order = ORDER[filter.sort ?? EnumMarketSort.NEWEST]
      for (const [column, direction] of Object.entries(order)) {
        query.addOrderBy(`listing.${column}`, direction)
      }
      const listings = await query.take(BROWSE_LIMIT).getMany()
      return { listings: await this.toListingViews(listings, userId, etm) }
    })
  }

  // My listings, my recent sales history, and my pets with what each could be sold for.
  async getMine(userId: string) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      await this.reapExpired(now, etm)
      const active = await etm.find(PetListingEntity, {
        where: { sellerId: userId, status: EnumPetListingStatus.ACTIVE },
        order: { createdAt: 'DESC' },
      })
      const history = await etm.find(PetListingEntity, {
        where: {
          sellerId: userId,
          status: In([
            EnumPetListingStatus.SOLD,
            EnumPetListingStatus.CANCELLED,
            EnumPetListingStatus.EXPIRED,
          ]),
        },
        order: { updatedAt: 'DESC' },
        take: HISTORY_LIMIT,
      })
      const living = await this.monsterService.getLiving(userId, etm)
      const boughtToday = await this.countBoughtToday(userId, now, etm)
      return {
        listings: await this.toListingViews(active, userId, etm),
        history: history.map(row => ({
          listingId: row.id,
          status: row.status,
          price: row.price,
          fee: row.fee,
          soldAt: row.soldAt,
          updatedAt: row.updatedAt,
        })),
        pets: living.map(pet => {
          const blocker =
            listingBlocker(pet, now) ??
            (living.length < 2 ? 'Keep at least one monster to play with' : null)
          const reference = this.tryReference(pet)
          return {
            monsterId: pet.id,
            ...toMonsterSummary(pet),
            blocker,
            referenceValue: reference,
            priceBand: reference ? priceBand(reference) : null,
          }
        }),
        limits: {
          maxActiveListings: MARKET_MAX_ACTIVE_LISTINGS,
          maxBuysPerDay: MARKET_MAX_BUYS_PER_DAY,
          boughtToday,
          maxMonsters: MAX_LIVING_MONSTERS,
        },
      }
    })
  }

  async create(userId: string, monsterId: string, price: number) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      await this.reapExpired(now, etm)
      const living = await this.monsterService.lockAndTickLiving(userId, now, etm)
      const pet = living.find(row => row.id === monsterId)
      if (!pet) {
        throw new NotFoundException('Monster not found')
      }
      const blocker = listingBlocker(pet, now)
      if (blocker) {
        throw new BadRequestException(blocker)
      }
      if (living.length < 2) {
        throw new BadRequestException('Keep at least one monster to play with')
      }
      const active = await etm.count(PetListingEntity, {
        where: { sellerId: userId, status: EnumPetListingStatus.ACTIVE },
      })
      if (active >= MARKET_MAX_ACTIVE_LISTINGS) {
        throw new BadRequestException(
          `You can have at most ${MARKET_MAX_ACTIVE_LISTINGS} listings at once`
        )
      }
      const band = priceBand(referenceValue(pet.stage, pet.line, pet.potential))
      if (price < band.min || price > band.max) {
        throw new BadRequestException(`Price must be between ${band.min} and ${band.max} gems`)
      }
      // Frozen from here: gear goes back to the bag and the arena and support copies are removed.
      await releasePet(pet.id, etm)
      await etm.update(MonsterEntity, pet.id, { isListed: true })
      const listing = await etm.save(PetListingEntity, {
        sellerId: userId,
        buyerId: null,
        monsterId: pet.id,
        price,
        fee: 0,
        status: EnumPetListingStatus.ACTIVE,
        expiresAt: new Date(now.getTime() + MARKET_LISTING_MS),
        soldAt: null,
      })
      return { listing: (await this.toListingViews([listing], userId, etm))[0] }
    })
  }

  async cancel(userId: string, listingId: string) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      await this.reapExpired(now, etm)
      const listing = await etm.findOne(PetListingEntity, {
        where: { id: listingId, sellerId: userId, status: EnumPetListingStatus.ACTIVE },
        lock: { mode: 'pessimistic_write' },
      })
      if (!listing) {
        throw new NotFoundException('Listing not found')
      }
      await this.release(listing, EnumPetListingStatus.CANCELLED, now, etm)
      return { ok: true }
    })
  }

  async buy(userId: string, listingId: string) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      await this.reapExpired(now, etm)
      const listing = await etm.findOne(PetListingEntity, {
        where: { id: listingId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!listing || listing.status !== EnumPetListingStatus.ACTIVE) {
        throw new NotFoundException('This listing is no longer available')
      }
      if (listing.sellerId === userId) {
        throw new BadRequestException('You can not buy your own monster')
      }
      if ((await this.countBoughtToday(userId, now, etm)) >= MARKET_MAX_BUYS_PER_DAY) {
        throw new BadRequestException(
          `You can buy at most ${MARKET_MAX_BUYS_PER_DAY} monsters a day`
        )
      }

      // Both wallets first, in user-id order, then the buyer's pets: same order as renting.
      await this.walletService.lockWallets([userId, listing.sellerId], etm)
      const living = await this.monsterService.lockAndTickLiving(userId, now, etm)
      const listed = await etm.count(MonsterEntity, {
        where: { ownerId: userId, isListed: true },
      })
      if (living.length + listed >= MAX_LIVING_MONSTERS) {
        throw new BadRequestException(`You can raise at most ${MAX_LIVING_MONSTERS} monsters`)
      }
      const pet = await etm.findOne(MonsterEntity, {
        where: { id: listing.monsterId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!pet || !pet.isListed || pet.ownerId !== listing.sellerId || pet.diedAt) {
        throw new BadRequestException('This listing is no longer available')
      }

      const fee = marketFee(listing.price)
      await this.walletService.change(
        userId,
        EnumWalletCurrency.GEM,
        -listing.price,
        EnumWalletTransactionReason.PET_MARKET_BUY,
        listing.id,
        etm
      )
      await this.walletService.change(
        listing.sellerId,
        EnumWalletCurrency.GEM,
        listing.price - fee,
        EnumWalletTransactionReason.PET_MARKET_SELL,
        listing.id,
        etm
      )

      // The pet keeps its level, stats and name; hearts reset so a neglected pet is no trap, the
      // worn costume stays with the seller (costumes are owned per player) and the buyer may rename.
      const bought = await etm.save(
        MonsterEntity,
        Object.assign(pet, {
          ownerId: userId,
          isListed: false,
          lastTickAt: now,
          fullness: MARKET_NEUTRAL_HEARTS,
          strength: MARKET_NEUTRAL_HEARTS,
          poops: 0,
          isSick: false,
          costume: {},
          selectedAt: null,
          lastRenamedAt: null,
          marketBoundUntil: new Date(now.getTime() + MARKET_RESALE_COOLDOWN_MS),
        })
      )
      Object.assign(listing, {
        status: EnumPetListingStatus.SOLD,
        buyerId: userId,
        fee,
        soldAt: now,
      })
      await etm.save(PetListingEntity, listing)
      return { monster: toMonsterView(bought) }
    })
  }

  private tryReference(pet: MonsterEntity) {
    try {
      return referenceValue(pet.stage, pet.line, pet.potential)
    } catch {
      return null
    }
  }

  private countBoughtToday(userId: string, now: Date, etm: EntityManager) {
    return etm.count(PetListingEntity, {
      where: {
        buyerId: userId,
        status: EnumPetListingStatus.SOLD,
        soldAt: MoreThan(new Date(now.getTime() - MARKET_DAY_MS)),
      },
    })
  }

  // Ends a listing without a sale: the pet is unfrozen with its clock restarted, so the time it
  // spent listed does not age it.
  private async release(
    listing: PetListingEntity,
    status: EnumPetListingStatus,
    now: Date,
    etm: EntityManager
  ) {
    listing.status = status
    await etm.save(PetListingEntity, listing)
    await etm.update(MonsterEntity, listing.monsterId, { isListed: false, lastTickAt: now })
  }

  // No cron: listings past their time are returned to their sellers by whoever touches the market next.
  private async reapExpired(now: Date, etm: EntityManager) {
    const expired = await etm.find(PetListingEntity, {
      where: { status: EnumPetListingStatus.ACTIVE, expiresAt: LessThanOrEqual(now) },
      order: { expiresAt: 'ASC' },
      take: REAP_BATCH,
      lock: { mode: 'pessimistic_write' },
    })
    for (const listing of expired) {
      await this.release(listing, EnumPetListingStatus.EXPIRED, now, etm)
    }
  }

  private async toListingViews(listings: PetListingEntity[], userId: string, etm: EntityManager) {
    if (listings.length === 0) {
      return []
    }
    const pets = await etm.find(MonsterEntity, {
      where: { id: In(listings.map(row => row.monsterId)) },
    })
    const petById = new Map(pets.map(pet => [pet.id, pet]))
    const names = await this.profileService.getNames(
      [...new Set(listings.map(row => row.sellerId))],
      etm
    )
    return listings.flatMap(listing => {
      const pet = petById.get(listing.monsterId)
      if (!pet) {
        return []
      }
      return [
        {
          listingId: listing.id,
          price: listing.price,
          expiresAt: listing.expiresAt,
          sellerName: names.get(listing.sellerId) ?? '',
          mine: listing.sellerId === userId,
          pet: toPetView(pet),
        },
      ]
    })
  }
}

const toMonsterSummary = (pet: MonsterEntity) => {
  const species = getSpecies(pet.speciesId)
  return {
    speciesId: species.id,
    name: species.name,
    emoji: species.emoji,
    sprite: species.sprite,
    line: pet.line,
    stage: pet.stage,
    nickname: pet.nickname,
  }
}
