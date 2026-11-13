import { ConflictException, Injectable } from '@nestjs/common'
import { DataSource, EntityManager, QueryFailedError } from 'typeorm'
import {
  TdCurrencyLedgerEntity,
  EnumTdCurrency,
} from '../../db/entities/td/td-currency-ledger.entity'
import { TdGachaPullEntity } from '../../db/entities/td/td-gacha-pull.entity'
import { TdGoalClaimEntity } from '../../db/entities/td/td-goal-claim.entity'
import { TdHeroOwnedEntity } from '../../db/entities/td/td-hero-owned.entity'
import { TdPlayerProfileEntity } from '../../db/entities/td/td-player-profile.entity'
import { TdStageProgressEntity } from '../../db/entities/td/td-stage-progress.entity'
import { ENERGY_CAP } from './energy'
import {
  IClaimPlan,
  achievementList,
  dailyList,
  dayBounds,
  planAchievementClaim,
  planDailyClaim,
  planTrackClaim,
  trackState,
  utcDay,
} from './goals'
import { ACHIEVEMENTS, DAILY_GOALS, TRACK_GEMS } from './goals.config'

const PG_UNIQUE_VIOLATION = '23505'

@Injectable()
export class TdGoalsService {
  constructor(private readonly dataSource: DataSource) {}

  // Goals screen: definitions, today's progress, claimed flags and the track position. Every
  // number is derived from rows the server wrote (finished battles, pulls, ledger, claims).
  async getGoals(userId: string, now: Date = new Date()) {
    const etm = this.dataSource.manager
    const day = utcDay(now)
    const [counts, totals, claims] = await Promise.all([
      this.todayCounts(etm, userId, now),
      this.totals(etm, userId),
      this.claims(etm, userId),
    ])
    const daily = dailyList(counts, claims.keys, day)
    return {
      config: {
        daily: DAILY_GOALS,
        trackGems: TRACK_GEMS,
        achievements: ACHIEVEMENTS,
        // Goals reset at 00:00 UTC.
        resetAt: dayBounds(now).end.toISOString(),
      },
      daily,
      track: trackState(
        claims.trackCount,
        claims.lastTrackDay,
        day,
        daily.some(g => g.complete)
      ),
      achievements: achievementList(totals, claims.keys),
    }
  }

  claimDaily(userId: string, goalId: string, now: Date = new Date()) {
    return this.claim(userId, now, async (etm, day) =>
      planDailyClaim(
        goalId,
        await this.todayCounts(etm, userId, now),
        (await this.claims(etm, userId)).keys,
        day
      )
    )
  }

  claimTrack(userId: string, now: Date = new Date()) {
    return this.claim(userId, now, async (etm, day) => {
      const claims = await this.claims(etm, userId)
      const counts = await this.todayCounts(etm, userId, now)
      const active = dailyList(counts, claims.keys, day).some(g => g.complete)
      return planTrackClaim(claims.trackCount, claims.lastTrackDay, day, active)
    })
  }

  claimAchievement(userId: string, id: string, now: Date = new Date()) {
    return this.claim(userId, now, async etm =>
      planAchievementClaim(
        id,
        await this.totals(etm, userId),
        (await this.claims(etm, userId)).keys
      )
    )
  }

  // One transaction: lock the player (claims by one player run one after another), re-derive
  // progress on committed data, record the claim under its unique key, then pay gems through the
  // ledger. A losing concurrent claim fails on the plan check or on the unique key, and the whole
  // transaction rolls back, so nothing is paid twice.
  private async claim(
    userId: string,
    now: Date,
    plan: (etm: EntityManager, day: string) => Promise<IClaimPlan>
  ) {
    const day = utcDay(now)
    try {
      return await this.dataSource.transaction(async etm => {
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
        const { claimKey, gems } = await plan(etm, day)
        await etm.insert(TdGoalClaimEntity, { userId, claimKey, claimedOn: day, gems })
        await etm.insert(TdCurrencyLedgerEntity, {
          userId,
          currency: EnumTdCurrency.GEMS,
          amount: gems,
          reason: `goal:${claimKey}`,
        })
        return { claimKey, gems }
      })
    } catch (e) {
      if (
        e instanceof QueryFailedError &&
        (e.driverError as { code?: string })?.code === PG_UNIQUE_VIOLATION
      ) {
        throw new ConflictException('Already claimed')
      }
      throw e
    }
  }

  private async claims(etm: EntityManager, userId: string) {
    const rows = await etm.find(TdGoalClaimEntity, { where: { userId } })
    const track = rows.filter(r => r.claimKey.startsWith('track:'))
    return {
      keys: new Set(rows.map(r => r.claimKey)),
      trackCount: track.length,
      lastTrackDay:
        track
          .map(r => r.claimedOn)
          .sort()
          .pop() ?? null,
    }
  }

  // Events inside the current UTC day: wins from replayed battles, pulls, and gear upgrades
  // (the coin spend the upgrade endpoint writes to the ledger).
  private async todayCounts(etm: EntityManager, userId: string, now: Date) {
    const { start, end } = dayBounds(now)
    const count = (table: string, where: string) =>
      etm
        .query(`SELECT count(*)::int AS n FROM td.${table} WHERE user_id = $1 AND ${where}`, [
          userId,
          start,
          end,
        ])
        .then((r: { n: number }[]) => r[0].n)
    const [battles_won, pulls, gear_upgrades] = await Promise.all([
      count('battle_session', `result = 'won' AND finished_at >= $2 AND finished_at < $3`),
      count('gacha_pull', `created_at >= $2 AND created_at < $3`),
      count('currency_ledger', `reason LIKE 'gear_mod:%' AND created_at >= $2 AND created_at < $3`),
    ])
    return { battles_won, pulls, gear_upgrades }
  }

  private async totals(etm: EntityManager, userId: string) {
    const [stars, heroes, pulls] = await Promise.all([
      etm
        .createQueryBuilder(TdStageProgressEntity, 's')
        .select('COALESCE(SUM(s.stars), 0)', 'n')
        .where('s.user_id = :userId', { userId })
        .getRawOne<{ n: string }>(),
      etm.countBy(TdHeroOwnedEntity, { userId }),
      etm.countBy(TdGachaPullEntity, { userId }),
    ])
    return { stars: Number(stars?.n ?? 0), heroes, pulls }
  }
}
