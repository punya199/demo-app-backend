import { Injectable, NotFoundException } from '@nestjs/common'
import { randomInt, randomUUID } from 'crypto'
import { DataSource, EntityManager } from 'typeorm'
import { TdGachaPityEntity } from '../../db/entities/td/td-gacha-pity.entity'
import { TdGachaPullEntity } from '../../db/entities/td/td-gacha-pull.entity'
import { TdHeroOwnedEntity } from '../../db/entities/td/td-hero-owned.entity'
import {
  EnumTdCurrency,
  TdCurrencyLedgerEntity,
} from '../../db/entities/td/td-currency-ledger.entity'
import { TdPlayerProfileEntity } from '../../db/entities/td/td-player-profile.entity'
import { ENERGY_CAP } from './energy'
import { GachaMode, planPull, pullCount } from './gacha'
import {
  GACHA_DUPLICATE_SHARDS,
  GACHA_PITY_LIMIT,
  GACHA_RATES,
  GACHA_SINGLE_COST,
  GACHA_TEN_COST,
  TD_HEROES,
} from './gacha.config'
import { planStarUp } from './hero'
import { STAR_UP_SHARD_COSTS } from './hero.config'

const utcDay = (now: Date) => now.toISOString().slice(0, 10)

@Injectable()
export class TdGachaService {
  constructor(private readonly dataSource: DataSource) {}

  // Everything the client needs to draw the gacha screen. Rates come from the same config the
  // server rolls with.
  async getGacha(userId: string, now: Date = new Date()) {
    const pity = await this.dataSource.manager.findOneBy(TdGachaPityEntity, { userId })
    const owned = await this.dataSource.manager.find(TdHeroOwnedEntity, { where: { userId } })
    const current = pity?.pity ?? 0
    return {
      config: {
        rates: GACHA_RATES,
        singleCost: GACHA_SINGLE_COST,
        tenCost: GACHA_TEN_COST,
        pityLimit: GACHA_PITY_LIMIT,
        duplicateShards: GACHA_DUPLICATE_SHARDS,
        heroes: TD_HEROES,
        starUpCosts: STAR_UP_SHARD_COSTS,
      },
      state: {
        pity: current,
        pullsUntilLegendary: GACHA_PITY_LIMIT - current,
        freePullAvailable: pity?.lastFreePullOn !== utcDay(now),
        ownedHeroIds: owned.map(h => h.heroId),
        ownedHeroes: owned.map(h => ({ heroId: h.heroId, starLevel: h.starLevel })),
      },
    }
  }

  // One transaction. The player's profile row is locked first, so two pulls by the same player run
  // one after the other: balance, pity and free-pull checks are made on committed data, and a
  // failed check rolls everything back.
  async pull(userId: string, mode: GachaMode, now: Date = new Date()) {
    return this.dataSource.transaction(async etm => {
      await this.lockPlayer(etm, userId, now)
      await etm
        .createQueryBuilder()
        .insert()
        .into(TdGachaPityEntity)
        .values({ userId, pity: 0 })
        .orIgnore()
        .execute()
      const pity = await etm.findOneByOrFail(TdGachaPityEntity, { userId })
      const gems = await this.balance(etm, userId, EnumTdCurrency.GEMS)
      const owned = new Set(
        (await etm.find(TdHeroOwnedEntity, { where: { userId } })).map(h => h.heroId)
      )
      const today = utcDay(now)

      const plan = planPull({
        mode,
        gems,
        pity: pity.pity,
        freeClaimedToday: pity.lastFreePullOn === today,
        owned,
        seeds: Array.from({ length: pullCount(mode) }, () => randomInt(0, 2 ** 32)),
      })

      await etm.update(TdGachaPityEntity, pity.id, {
        pity: plan.pity,
        ...(mode === 'free' ? { lastFreePullOn: today } : {}),
      })
      const shards = plan.pulls.reduce((sum, p) => sum + p.shards, 0)
      const ledger: Partial<TdCurrencyLedgerEntity>[] = []
      if (plan.cost > 0) {
        ledger.push({
          userId,
          currency: EnumTdCurrency.GEMS,
          amount: -plan.cost,
          reason: `gacha_${mode}`,
        })
      }
      if (shards > 0) {
        ledger.push({
          userId,
          currency: EnumTdCurrency.SHARDS,
          amount: shards,
          reason: 'gacha_duplicate',
        })
      }
      if (ledger.length) {
        await etm.insert(TdCurrencyLedgerEntity, ledger)
      }
      const newHeroes = plan.pulls.filter(p => !p.duplicate).map(p => p.hero.id)
      if (newHeroes.length) {
        await etm.insert(
          TdHeroOwnedEntity,
          [...new Set(newHeroes)].map(heroId => ({ userId, heroId }))
        )
      }
      const batchId = randomUUID()
      await etm.insert(
        TdGachaPullEntity,
        plan.pulls.map(p => ({
          userId,
          batchId,
          seed: String(p.seed),
          pityBefore: p.pityBefore,
          heroId: p.hero.id,
          rarity: p.hero.rarity,
          duplicate: p.duplicate,
          mode,
        }))
      )

      return {
        pulls: plan.pulls.map(p => ({
          heroId: p.hero.id,
          rarity: p.hero.rarity,
          duplicate: p.duplicate,
          shards: p.shards,
        })),
        cost: plan.cost,
        pity: plan.pity,
        pullsUntilLegendary: GACHA_PITY_LIMIT - plan.pity,
        balances: {
          gems: gems - plan.cost,
          shards: await this.balance(etm, userId, EnumTdCurrency.SHARDS),
        },
      }
    })
  }

  // Spends shards to raise an owned hero by one star. Same player lock as pulls, so the shard
  // balance read here is the committed one; the spend is a negative ledger row, never an edit.
  async starUp(userId: string, heroId: string, now: Date = new Date()) {
    return this.dataSource.transaction(async etm => {
      await this.lockPlayer(etm, userId, now)
      const hero = await etm.findOneBy(TdHeroOwnedEntity, { userId, heroId })
      if (!hero) {
        throw new NotFoundException('Hero not owned')
      }
      const shards = await this.balance(etm, userId, EnumTdCurrency.SHARDS)
      const plan = planStarUp(hero.starLevel, shards)
      await etm.insert(TdCurrencyLedgerEntity, {
        userId,
        currency: EnumTdCurrency.SHARDS,
        amount: -plan.cost,
        reason: `star_up:${heroId}`,
      })
      await etm.update(TdHeroOwnedEntity, hero.id, { starLevel: plan.nextStar })
      return {
        heroId,
        starLevel: plan.nextStar,
        cost: plan.cost,
        balances: { shards: shards - plan.cost },
      }
    })
  }

  private async lockPlayer(etm: EntityManager, userId: string, now: Date) {
    await etm
      .createQueryBuilder()
      .insert()
      .into(TdPlayerProfileEntity)
      .values({ userId, energy: ENERGY_CAP, energyUpdatedAt: now })
      .orIgnore()
      .execute()
    await etm.findOneOrFail(TdPlayerProfileEntity, {
      where: { userId },
      lock: { mode: 'pessimistic_write' },
    })
  }

  private async balance(etm: EntityManager, userId: string, currency: EnumTdCurrency) {
    const row = await etm
      .createQueryBuilder(TdCurrencyLedgerEntity, 'l')
      .select('COALESCE(SUM(l.amount), 0)', 'total')
      .where('l.user_id = :userId AND l.currency = :currency', { userId, currency })
      .getRawOne<{ total: string }>()
    return Number(row?.total ?? 0)
  }
}
