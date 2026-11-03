import { BadRequestException, Injectable } from '@nestjs/common'
import { DataSource, EntityManager } from 'typeorm'
import { PassiveAllocationEntity } from '../../db/entities/passive-allocation.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../db/entities/wallet-transaction.entity'
import { WalletService } from '../wallet/wallet.service'
import {
  calcPassiveBonus,
  calcPassivePoints,
  branchOf,
  calcRespecCost,
  canAllocate,
  canDeallocate,
  PASSIVE_BRANCH_REFUND_CAP,
  PASSIVE_FREE_REFUNDS,
  PASSIVE_NODES,
  PASSIVE_RESPEC_GEM_PRICE,
} from './passive-data'
import { PVP_SEASON_MIN_FIGHTS } from './monster-rules'
import { getSeason } from './pvp-season'

// The owner's allocated nodes. Used by every fight, expedition and drop, so it stays one cheap read.
export const loadPassiveBonus = async (userId: string, etm: EntityManager) => {
  const row = await etm.findOne(PassiveAllocationEntity, { where: { userId } })
  return calcPassiveBonus(row?.nodeIds ?? [])
}

// What the player has achieved so far, which is what earns passive points.
const loadProgress = async (userId: string, now: Date, etm: EntityManager) => {
  const count = async (query: string) => (await etm.query<{ n: number }[]>(query, [userId]))[0].n
  const [dexSpecies, raidFirstClears, adventureClears, totalWins, worldBossDefeats, seasons] =
    await Promise.all([
      count(
        `SELECT count(*)::int AS n FROM "monster_dex" WHERE "user_id" = $1 AND "deleted_at" IS NULL`
      ),
      count(
        `SELECT count(*)::int AS n FROM "raid_progress" WHERE "user_id" = $1 AND "deleted_at" IS NULL`
      ),
      count(
        `SELECT count(*)::int AS n FROM "adventure_progress" WHERE "user_id" = $1 AND "deleted_at" IS NULL`
      ),
      // Merged or retired monsters keep their wins, so deleted rows count too.
      count(`SELECT coalesce(sum("wins"), 0)::int AS n FROM "monsters" WHERE "owner_id" = $1`),
      count(
        `SELECT count(*)::int AS n FROM "world_boss_damage" d
       JOIN "world_bosses" b ON b."id" = d."world_boss_id"
       WHERE d."user_id" = $1 AND d."hits" > 0 AND b."defeated_at" IS NOT NULL
         AND d."deleted_at" IS NULL AND b."deleted_at" IS NULL`
      ),
      // Final rank of every finished season the player qualified for (same ranking as the arena).
      etm.query<{ rank: number }[]>(
        `SELECT "rank"::int FROM (
         SELECT "user_id", rank() OVER (PARTITION BY "season" ORDER BY "rating" DESC) AS "rank"
         FROM "pvp_ratings"
         WHERE "season" < $2 AND ("wins" + "losses") >= $3 AND "deleted_at" IS NULL
       ) ranked WHERE "user_id" = $1`,
        [userId, getSeason(now), PVP_SEASON_MIN_FIGHTS]
      ),
    ])
  const pvpSeasonRanks = seasons.map(row => row.rank)
  return {
    dexSpecies,
    raidFirstClears,
    adventureClears,
    totalWins,
    worldBossDefeats,
    pvpSeasonRanks,
    earned: calcPassivePoints({
      dexSpecies,
      raidFirstClears,
      adventureClears,
      totalWins,
      worldBossDefeats,
      pvpSeasonRanks,
    }),
  }
}

@Injectable()
export class PassiveService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly walletService: WalletService
  ) {}

  private async state(row: PassiveAllocationEntity | null, userId: string, etm: EntityManager) {
    const progress = await loadProgress(userId, new Date(), etm)
    const nodeIds = row?.nodeIds ?? []
    const refunded = row?.refundedPoints ?? 0
    return {
      nodes: PASSIVE_NODES,
      allocated: nodeIds,
      points: {
        earned: progress.earned,
        used: nodeIds.length,
        left: Math.max(0, progress.earned - nodeIds.length),
        sources: {
          dexSpecies: progress.dexSpecies,
          raidFirstClears: progress.raidFirstClears,
          adventureClears: progress.adventureClears,
          totalWins: progress.totalWins,
          worldBossDefeats: progress.worldBossDefeats,
          pvpSeasons: progress.pvpSeasonRanks.length,
        },
      },
      respec: {
        refunded,
        freeLeft: Math.max(0, PASSIVE_FREE_REFUNDS - refunded),
        gemPrice: PASSIVE_RESPEC_GEM_PRICE,
        branchCap: PASSIVE_BRANCH_REFUND_CAP,
      },
    }
  }

  async getState(userId: string) {
    const etm = this.dataSource.manager
    return this.state(
      await etm.findOne(PassiveAllocationEntity, { where: { userId } }),
      userId,
      etm
    )
  }

  // The allocation row, created on first use and locked so two requests can't overspend points.
  private async lockRow(userId: string, etm: EntityManager) {
    await etm
      .createQueryBuilder()
      .insert()
      .into(PassiveAllocationEntity)
      .values({ userId, nodeIds: [], refundedPoints: 0 })
      .orIgnore()
      .execute()
    return (await etm.findOne(PassiveAllocationEntity, {
      where: { userId },
      lock: { mode: 'pessimistic_write' },
    }))!
  }

  async allocate(userId: string, nodeId: string) {
    return this.dataSource.transaction(async etm => {
      const row = await this.lockRow(userId, etm)
      if (!canAllocate(row.nodeIds, nodeId)) {
        throw new BadRequestException('That node is not connected to your tree')
      }
      const { earned } = await loadProgress(userId, new Date(), etm)
      if (row.nodeIds.length >= earned) {
        throw new BadRequestException('No passive points left')
      }
      row.nodeIds = [...row.nodeIds, nodeId]
      return this.state(await etm.save(PassiveAllocationEntity, row), userId, etm)
    })
  }

  // Taking points back costs gems once the free refunds are used up.
  private async refund(userId: string, nodeIds: string[], etm: EntityManager, maxCost = Infinity) {
    const row = await this.lockRow(userId, etm)
    const removing = new Set(nodeIds)
    if (!nodeIds.length || nodeIds.some(id => !row.nodeIds.includes(id))) {
      throw new BadRequestException('Nothing to take back')
    }
    const remaining = row.nodeIds.filter(id => !removing.has(id))
    if (maxCost === Infinity && nodeIds.length === 1 && !canDeallocate(row.nodeIds, nodeIds[0])) {
      throw new BadRequestException('Other nodes depend on this one')
    }
    const cost = Math.min(calcRespecCost(row.refundedPoints, nodeIds.length), maxCost)
    if (cost > 0) {
      await this.walletService.change(
        userId,
        EnumWalletCurrency.GEM,
        -cost,
        EnumWalletTransactionReason.PASSIVE_RESPEC,
        null,
        etm
      )
    }
    row.nodeIds = remaining
    row.refundedPoints += nodeIds.length
    return this.state(await etm.save(PassiveAllocationEntity, row), userId, etm)
  }

  async deallocate(userId: string, nodeId: string) {
    return this.dataSource.transaction(etm => this.refund(userId, [nodeId], etm))
  }

  // Takes back a node and everything that hangs off it. Never costs more than the branch cap.
  async deallocateBranch(userId: string, nodeId: string) {
    return this.dataSource.transaction(async etm => {
      const row = await this.lockRow(userId, etm)
      const branch = branchOf(row.nodeIds, nodeId)
      if (!row.nodeIds.includes(nodeId) || !branch.length) {
        throw new BadRequestException('Nothing to take back')
      }
      return this.refund(userId, branch, etm, PASSIVE_BRANCH_REFUND_CAP)
    })
  }

  async respec(userId: string) {
    return this.dataSource.transaction(async etm => {
      const row = await this.lockRow(userId, etm)
      return this.refund(userId, row.nodeIds, etm)
    })
  }
}
