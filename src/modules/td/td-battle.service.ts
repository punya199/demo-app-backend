import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { randomInt } from 'crypto'
import { DataSource } from 'typeorm'
import { SimInput } from '../../libs/td-sim'
import { TdCoreEntity } from '../../db/entities/td/td-core.entity'
import { TdGearModEntity } from '../../db/entities/td/td-gear-mod.entity'
import { TdRelicEntity } from '../../db/entities/td/td-relic.entity'
import { TdHeroOwnedEntity } from '../../db/entities/td/td-hero-owned.entity'
import { TdBattleSessionEntity } from '../../db/entities/td/td-battle-session.entity'
import {
  EnumTdCurrency,
  TdCurrencyLedgerEntity,
} from '../../db/entities/td/td-currency-ledger.entity'
import { TdPlayerProfileEntity } from '../../db/entities/td/td-player-profile.entity'
import { TdStageProgressEntity } from '../../db/entities/td/td-stage-progress.entity'
import { evaluateFinish, IBattleResult } from './battle'
import { BATTLE_TTL_MS } from './battle.config'
import { battleCores } from './core'
import { modLevels } from './gear'
import { buildPool } from './hero'
import { battleRelics } from './relic'
import { ENERGY_CAP, regenerateEnergy, STAGE_ENERGY_COST } from './energy'
import { assertStageUnlocked, planStageClear } from './stage'
import { grantStageCore } from './td-core.service'
import { TdBattleFinishDto } from './dto/td-battle-finish.dto'

@Injectable()
export class TdBattleService {
  constructor(private readonly dataSource: DataSource) {}

  // Spends the stage's energy and issues a single-use battle id with a server-chosen seed. The
  // profile row lock serialises this with other energy changes of the same player. A locked stage
  // is refused before any energy is charged.
  async start(userId: string, stageId: number, now: Date = new Date()) {
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
      assertStageUnlocked(stageId, await etm.find(TdStageProgressEntity, { where: { userId } }))
      const next = regenerateEnergy(profile.energy, profile.energyUpdatedAt, now)
      if (next.energy < STAGE_ENERGY_COST) {
        throw new HttpException('Not enough energy', HttpStatus.CONFLICT)
      }
      await etm.update(TdPlayerProfileEntity, profile.id, {
        energy: next.energy - STAGE_ENERGY_COST,
        energyUpdatedAt: next.updatedAt,
      })
      // Snapshot of the owned heroes and their gear mods; stored so the replay ignores any later change.
      const pool = buildPool(
        await etm.find(TdHeroOwnedEntity, { where: { userId } }),
        modLevels(await etm.find(TdGearModEntity, { where: { userId } }))
      )
      // Snapshot of the equipped cores; stored with the pool so the replay ignores later changes.
      const cores = battleCores(await etm.find(TdCoreEntity, { where: { userId } }))
      // Snapshot of the unlocked relics; stored too, so a later unlock never changes this replay.
      const relics = battleRelics(await etm.find(TdRelicEntity, { where: { userId } }))
      const seed = randomInt(0, 2 ** 32)
      const session = await etm.save(
        etm.create(TdBattleSessionEntity, {
          userId,
          seed: String(seed),
          heroPool: pool,
          cores,
          relics,
          stageId,
          expiresAt: new Date(now.getTime() + BATTLE_TTL_MS),
        })
      )
      return {
        battleId: session.id,
        seed,
        stageId,
        pool,
        cores,
        relics,
        expiresAt: session.expiresAt,
      }
    })
  }

  // The CPU-bound replay runs first, without a transaction or a lock, so it holds no pooled
  // connection. The payout transaction then locks the session row and re-checks its status, so
  // parallel finishes of one battle still pay once. A log that does not replay cleanly (422)
  // closes the session, so it cannot be used to make the server replay again and again.
  async finish(userId: string, battleId: string, dto: TdBattleFinishDto, now: Date = new Date()) {
    const found = await this.dataSource.manager.findOne(TdBattleSessionEntity, {
      where: { id: battleId, userId },
    })
    if (!found) {
      throw new HttpException('Battle not found', HttpStatus.NOT_FOUND)
    }
    // Copy only the known fields so nothing extra reaches the sim.
    const inputs = dto.inputs.map(
      ({ tick, type, tile, from, to, index }) => ({ tick, type, tile, from, to, index }) as SimInput
    )
    let result: IBattleResult
    try {
      result = evaluateFinish(
        {
          id: found.id,
          userId: found.userId,
          seed: Number(found.seed),
          status: found.status as 'started' | 'finished',
          pool: found.heroPool,
          cores: found.cores,
          relics: found.relics,
          stage: found.stageId,
          expiresAt: found.expiresAt,
        },
        { userId, seed: dto.seed, ticks: dto.ticks, inputs },
        now
      )
    } catch (error) {
      if (
        error instanceof HttpException &&
        error.getStatus() === (HttpStatus.UNPROCESSABLE_ENTITY as number)
      ) {
        await this.dataSource.manager.update(
          TdBattleSessionEntity,
          { id: found.id, userId, status: 'started' },
          { status: 'finished', result: 'invalid', coinsAwarded: 0, finishedAt: now }
        )
      }
      throw error
    }
    return this.dataSource.transaction(async etm => {
      const session = await etm.findOne(TdBattleSessionEntity, {
        where: { id: battleId, userId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!session) {
        throw new HttpException('Battle not found', HttpStatus.NOT_FOUND)
      }
      if (session.status !== 'started') {
        throw new HttpException('Battle already finished', HttpStatus.CONFLICT)
      }
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
      // First clear: the stage_progress row is created at most once (unique key), and only the
      // transaction that created it pays the gems, so a concurrent or repeated clear cannot pay twice.
      let gems = 0
      let core: { element: string; rarity: string } | null = null
      let stars = 0
      if (result.stars > 0) {
        const created = await etm
          .createQueryBuilder()
          .insert()
          .into(TdStageProgressEntity)
          .values({ userId, stageId: session.stageId, stars: result.stars })
          .orIgnore()
          .returning('id')
          .execute()
        if ((created.raw as unknown[]).length > 0) {
          const plan = planStageClear(session.stageId, null, result.stars)
          gems = plan.gems
          stars = plan.stars
          await etm.insert(TdCurrencyLedgerEntity, {
            userId,
            currency: EnumTdCurrency.GEMS,
            amount: gems,
            reason: `td_stage_first_clear:${session.stageId}`,
          })
          core = await grantStageCore(etm, userId, session.stageId)
        } else {
          const existing = await etm.findOneOrFail(TdStageProgressEntity, {
            where: { userId, stageId: session.stageId },
            lock: { mode: 'pessimistic_write' },
          })
          stars = planStageClear(session.stageId, existing.stars, result.stars).stars
          if (stars !== existing.stars)
            await etm.update(TdStageProgressEntity, existing.id, { stars })
        }
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
        stageId: session.stageId,
        stars: result.stars,
        bestStars: stars,
        firstClear: gems > 0,
        gems,
        core,
        balances: { coins: Number(row?.total ?? 0) },
      }
    })
  }
}
