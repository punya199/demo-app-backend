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

  // A plain read: no transaction, no row lock, nothing written. Energy is regenerated in memory
  // from the stored timestamp (a player without a profile row yet is simply at full energy); the
  // row is created and persisted by the paths that spend (battle start, sweep). Balances are
  // derived from the ledger.
  async getProfile(userId: string, now: Date = new Date()): Promise<ITdProfile> {
    const profile = await this.dataSource.manager.findOne(TdPlayerProfileEntity, {
      where: { userId },
    })
    const next = profile
      ? regenerateEnergy(profile.energy, profile.energyUpdatedAt, now)
      : { energy: ENERGY_CAP, updatedAt: now }

    const sums = await this.dataSource.manager
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
  }
}
