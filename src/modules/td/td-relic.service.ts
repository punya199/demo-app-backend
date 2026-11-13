import { Injectable } from '@nestjs/common'
import { DataSource, EntityManager } from 'typeorm'
import { RELIC_IDS, RelicId } from '../../libs/td-sim'
import { TdCoreEntity } from '../../db/entities/td/td-core.entity'
import {
  EnumTdCurrency,
  TdCurrencyLedgerEntity,
} from '../../db/entities/td/td-currency-ledger.entity'
import { TdHeroOwnedEntity } from '../../db/entities/td/td-hero-owned.entity'
import { TdPlayerProfileEntity } from '../../db/entities/td/td-player-profile.entity'
import { TdRelicEntity } from '../../db/entities/td/td-relic.entity'
import { ENERGY_CAP } from './energy'
import { IRelicOwnership, planRelicUnlock, relicView } from './relic'

@Injectable()
export class TdRelicService {
  constructor(private readonly dataSource: DataSource) {}

  async list(userId: string) {
    return this.view(await this.ownership(this.dataSource.manager, userId))
  }

  // Spends the configured coins and shards through the ledger and unlocks the relic, in one
  // transaction under the player lock. The hero, core, balance and "not yet unlocked" checks are
  // made after the lock is held, so two requests cannot both pass; the unique (user, relic) key is
  // the last guard. A refused unlock changes nothing.
  async unlock(userId: string, relicId: string, now: Date = new Date()) {
    return this.dataSource.transaction(async etm => {
      await this.lockPlayer(etm, userId, now)
      const own = await this.ownership(etm, userId)
      const coins = await this.balance(etm, userId, EnumTdCurrency.COINS)
      const shards = await this.balance(etm, userId, EnumTdCurrency.SHARDS)
      const { cost } = planRelicUnlock(relicId, own, { coins, shards })
      const reason = `relic_unlock:${relicId}`
      await etm.insert(TdCurrencyLedgerEntity, [
        { userId, currency: EnumTdCurrency.COINS, amount: -cost.coins, reason },
        { userId, currency: EnumTdCurrency.SHARDS, amount: -cost.shards, reason },
      ])
      await etm.insert(TdRelicEntity, { userId, relicId })
      return {
        ...this.view({ ...own, unlocked: [...own.unlocked, relicId] }),
        cost,
        balances: { coins: coins - cost.coins, shards: shards - cost.shards },
      }
    })
  }

  private view(own: IRelicOwnership) {
    return { relics: RELIC_IDS.map((id: RelicId) => relicView(id, own)) }
  }

  private async ownership(etm: EntityManager, userId: string): Promise<IRelicOwnership> {
    const [heroes, cores, relics] = await Promise.all([
      etm.find(TdHeroOwnedEntity, { where: { userId } }),
      etm.find(TdCoreEntity, { where: { userId } }),
      etm.find(TdRelicEntity, { where: { userId } }),
    ])
    return {
      heroes: heroes.map(h => h.heroId),
      coreElements: cores.map(c => c.element),
      unlocked: relics.map(r => r.relicId),
    }
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
