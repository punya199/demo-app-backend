import { Injectable, NotFoundException } from '@nestjs/common'
import { DataSource, EntityManager } from 'typeorm'
import { CORE_SLOTS } from '../../libs/td-sim'
import { TdCoreEntity } from '../../db/entities/td/td-core.entity'
import {
  EnumTdCurrency,
  TdCurrencyLedgerEntity,
} from '../../db/entities/td/td-currency-ledger.entity'
import { TdPlayerProfileEntity } from '../../db/entities/td/td-player-profile.entity'
import { coreGrantFor, coreView, planCoreEquip, planCorePromotion } from './core'
import { ENERGY_CAP } from './energy'

// Grants the stage's first-clear core. Call it only from the transaction that created the stage's
// first-clear row; the unique (user, source) key still makes a repeat a no-op. Returns the core
// granted, or null when it already existed.
export async function grantStageCore(etm: EntityManager, userId: string, stageId: number) {
  const grant = coreGrantFor(stageId)
  const created = await etm
    .createQueryBuilder()
    .insert()
    .into(TdCoreEntity)
    .values({ userId, ...grant, slot: null, source: `stage:${stageId}` })
    .orIgnore()
    .returning('id')
    .execute()
  return (created.raw as unknown[]).length > 0 ? grant : null
}

@Injectable()
export class TdCoreService {
  constructor(private readonly dataSource: DataSource) {}

  async list(userId: string) {
    const rows = await this.dataSource.manager.find(TdCoreEntity, {
      where: { userId },
      order: { createdAt: 'ASC', id: 'ASC' },
    })
    return { slots: CORE_SLOTS, cores: rows.map(coreView) }
  }

  // Puts the core in the slot; whoever held the slot is unequipped. The profile row lock serialises
  // this with the player's other changes, so two requests cannot fill one slot twice.
  async equip(userId: string, coreId: string, slot: number, now: Date = new Date()) {
    return this.dataSource.transaction(async etm => {
      await this.lockPlayer(etm, userId, now)
      const rows = await etm.find(TdCoreEntity, { where: { userId } })
      const plan = planCoreEquip(coreId, slot, rows)
      if (plan.displacedId) await etm.update(TdCoreEntity, plan.displacedId, { slot: null })
      await etm.update(TdCoreEntity, coreId, { slot })
      const after = await etm.find(TdCoreEntity, {
        where: { userId },
        order: { createdAt: 'ASC', id: 'ASC' },
      })
      return { slots: CORE_SLOTS, cores: after.map(coreView) }
    })
  }

  // Spends the configured coins and shards through the ledger and raises the rarity one tier, in
  // one transaction under the player and core locks. A refused promotion changes nothing.
  async promote(userId: string, coreId: string, now: Date = new Date()) {
    return this.dataSource.transaction(async etm => {
      await this.lockPlayer(etm, userId, now)
      const core = await etm.findOne(TdCoreEntity, {
        where: { id: coreId, userId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!core) throw new NotFoundException('Core not found')
      const coins = await this.balance(etm, userId, EnumTdCurrency.COINS)
      const shards = await this.balance(etm, userId, EnumTdCurrency.SHARDS)
      const plan = planCorePromotion(core.rarity, { coins, shards })
      const reason = `core_promote:${core.id}:${plan.nextRarity}`
      await etm.insert(TdCurrencyLedgerEntity, [
        { userId, currency: EnumTdCurrency.COINS, amount: -plan.cost.coins, reason },
        { userId, currency: EnumTdCurrency.SHARDS, amount: -plan.cost.shards, reason },
      ])
      await etm.update(TdCoreEntity, core.id, { rarity: plan.nextRarity })
      return {
        core: coreView({ ...core, rarity: plan.nextRarity }),
        cost: plan.cost,
        balances: { coins: coins - plan.cost.coins, shards: shards - plan.cost.shards },
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
