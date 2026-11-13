import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import {
  EnumTdCurrency,
  TdCurrencyLedgerEntity,
} from '../../db/entities/td/td-currency-ledger.entity'
import { TdPlayerProfileEntity } from '../../db/entities/td/td-player-profile.entity'
import { TdStageProgressEntity } from '../../db/entities/td/td-stage-progress.entity'
import { ENERGY_CAP, regenerateEnergy, STAGE_ENERGY_COST } from './energy'
import { planSweep } from './stage'

@Injectable()
export class TdSweepService {
  constructor(private readonly dataSource: DataSource) {}

  // Spends the stage's energy and pays its repeatable reward in one transaction. The profile row
  // lock serialises concurrent sweeps (and battle starts) of the same player, so energy cannot be
  // spent twice from one balance. A rejected sweep changes nothing.
  async sweep(userId: string, stageId: number, now: Date = new Date()) {
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
      const reward = planSweep(
        stageId,
        await etm.find(TdStageProgressEntity, { where: { userId } })
      )
      const next = regenerateEnergy(profile.energy, profile.energyUpdatedAt, now)
      if (next.energy < STAGE_ENERGY_COST) {
        throw new HttpException('Not enough energy', HttpStatus.CONFLICT)
      }
      const energy = next.energy - STAGE_ENERGY_COST
      await etm.update(TdPlayerProfileEntity, profile.id, {
        energy,
        energyUpdatedAt: next.updatedAt,
      })
      await etm.insert(TdCurrencyLedgerEntity, [
        {
          userId,
          currency: EnumTdCurrency.COINS,
          amount: reward.coins,
          reason: `td_sweep:${stageId}`,
        },
        {
          userId,
          currency: EnumTdCurrency.SHARDS,
          amount: reward.shards,
          reason: `td_sweep:${stageId}`,
        },
      ])
      return { stageId, energy, coins: reward.coins, shards: reward.shards }
    })
  }
}
