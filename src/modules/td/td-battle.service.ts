import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { randomInt } from 'crypto'
import { DataSource } from 'typeorm'
import { SimInput } from '../../libs/td-sim'
import { TdBattleSessionEntity } from '../../db/entities/td/td-battle-session.entity'
import {
  EnumTdCurrency,
  TdCurrencyLedgerEntity,
} from '../../db/entities/td/td-currency-ledger.entity'
import { TdPlayerProfileEntity } from '../../db/entities/td/td-player-profile.entity'
import { evaluateFinish } from './battle'
import { BATTLE_TTL_MS } from './battle.config'
import { ENERGY_CAP, regenerateEnergy, STAGE_ENERGY_COST } from './energy'
import { TdBattleFinishDto } from './dto/td-battle-finish.dto'

@Injectable()
export class TdBattleService {
  constructor(private readonly dataSource: DataSource) {}

  // Spends the stage's energy and issues a single-use battle id with a server-chosen seed. The
  // profile row lock serialises this with other energy changes of the same player.
  async start(userId: string, now: Date = new Date()) {
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
      if (next.energy < STAGE_ENERGY_COST) {
        throw new HttpException('Not enough energy', HttpStatus.CONFLICT)
      }
      await etm.update(TdPlayerProfileEntity, profile.id, {
        energy: next.energy - STAGE_ENERGY_COST,
        energyUpdatedAt: next.updatedAt,
      })
      const seed = randomInt(0, 2 ** 32)
      const session = await etm.save(
        etm.create(TdBattleSessionEntity, {
          userId,
          seed: String(seed),
          expiresAt: new Date(now.getTime() + BATTLE_TTL_MS),
        })
      )
      return { battleId: session.id, seed, expiresAt: session.expiresAt }
    })
  }

  // Locks the session row, replays the log, and in the same transaction closes the session and
  // appends the coin reward to the ledger. A rejected request changes nothing.
  async finish(userId: string, battleId: string, dto: TdBattleFinishDto, now: Date = new Date()) {
    return this.dataSource.transaction(async etm => {
      const session = await etm.findOne(TdBattleSessionEntity, {
        where: { id: battleId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!session) {
        throw new HttpException('Battle not found', HttpStatus.NOT_FOUND)
      }
      // Copy only the known fields so nothing extra reaches the sim.
      const inputs = dto.inputs.map(
        ({ tick, type, tile, from, to, index }) =>
          ({ tick, type, tile, from, to, index }) as SimInput
      )
      const result = evaluateFinish(
        {
          id: session.id,
          userId: session.userId,
          seed: Number(session.seed),
          status: session.status as 'started' | 'finished',
          expiresAt: session.expiresAt,
        },
        { userId, seed: dto.seed, ticks: dto.ticks, inputs },
        now
      )
      await etm.update(TdBattleSessionEntity, session.id, {
        status: 'finished',
        result: result.status,
        coinsAwarded: result.coins,
        replayHash: result.hash,
        finishedAt: now,
      })
      if (result.coins > 0) {
        await etm.insert(TdCurrencyLedgerEntity, {
          userId,
          currency: EnumTdCurrency.COINS,
          amount: result.coins,
          reason: `td_battle:${session.id}`,
        })
      }
      const row = await etm
        .createQueryBuilder(TdCurrencyLedgerEntity, 'l')
        .select('COALESCE(SUM(l.amount), 0)', 'total')
        .where('l.user_id = :userId AND l.currency = :currency', {
          userId,
          currency: EnumTdCurrency.COINS,
        })
        .getRawOne<{ total: string }>()
      return {
        result: result.status,
        rounds: result.round,
        coins: result.coins,
        balances: { coins: Number(row?.total ?? 0) },
      }
    })
  }
}
