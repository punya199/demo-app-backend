import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import {
  EnumTdCurrency,
  TdCurrencyLedgerEntity,
} from '../../db/entities/td/td-currency-ledger.entity'
import { TdPlayerProfileEntity } from '../../db/entities/td/td-player-profile.entity'
import { ENERGY_CAP, ENERGY_REGEN_MS, regenerateEnergy, STAGE_ENERGY_COST } from './energy'

export interface ITdProfile {
  energy: { current: number; cap: number; stageCost: number; secondsToNext: number | null }
  balances: Record<EnumTdCurrency, number>
}

@Injectable()
export class TdProfileService {
  constructor(private readonly dataSource: DataSource) {}

  // Creates the profile on first use (full energy), brings energy up to date from the stored
  // timestamp, and derives balances from the ledger. The row lock keeps parallel reads from
  // granting the same regeneration twice.
  async getProfile(userId: string, now: Date = new Date()): Promise<ITdProfile> {
    return this.dataSource.transaction(async etm => {
      await etm
        .createQueryBuilder()
        .insert()
        .into(TdPlayerProfileEntity)
        .values({ userId, energy: ENERGY_CAP, energyUpdatedAt: now })
        .orIgnore()
        .execute()
      const profile = await etm.findOneOrFail(TdPlayerProfileEntity, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      })
      const next = regenerateEnergy(profile.energy, profile.energyUpdatedAt, now)
      if (
        next.energy !== profile.energy ||
        next.updatedAt.getTime() !== profile.energyUpdatedAt.getTime()
      ) {
        await etm.update(TdPlayerProfileEntity, profile.id, {
          energy: next.energy,
          energyUpdatedAt: next.updatedAt,
        })
      }

      const sums = await etm
        .createQueryBuilder(TdCurrencyLedgerEntity, 'l')
        .select('l.currency', 'currency')
        .addSelect('COALESCE(SUM(l.amount), 0)', 'total')
        .where('l.user_id = :userId', { userId })
        .groupBy('l.currency')
        .getRawMany<{ currency: EnumTdCurrency; total: string }>()
      const balances = Object.fromEntries(
        Object.values(EnumTdCurrency).map(currency => [currency, 0])
      ) as Record<EnumTdCurrency, number>
      for (const { currency, total } of sums) {
        balances[currency] = Number(total)
      }

      const elapsed = now.getTime() - next.updatedAt.getTime()
      return {
        energy: {
          current: next.energy,
          cap: ENERGY_CAP,
          stageCost: STAGE_ENERGY_COST,
          secondsToNext:
            next.energy >= ENERGY_CAP
              ? null
              : Math.ceil((ENERGY_REGEN_MS - Math.max(elapsed, 0)) / 1000),
        },
        balances,
      }
    })
  }
}
