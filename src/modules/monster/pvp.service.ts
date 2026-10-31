import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { createHash, randomInt } from 'crypto'
import { isUUID } from 'class-validator'
import { DataSource, EntityManager, In, MoreThanOrEqual } from 'typeorm'
import { PvpBattleEntity } from '../../db/entities/pvp-battle.entity'
import { PvpDefenseEntity } from '../../db/entities/pvp-defense.entity'
import { PvpRatingEntity } from '../../db/entities/pvp-rating.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../db/entities/wallet-transaction.entity'
import { WalletService } from '../wallet/wallet.service'
import { simulateBattle } from './battle-engine'
import { IFighter, toFighter } from './battle-stats'
import { calcElo, START_RATING } from './elo'
import { loadEquipmentBonus } from './equipment.service'
import { applyPvpOutcome, assertCanBattle } from './monster-engine'
import {
  MAX_STAMINA,
  PVP_DAILY_ATTEMPTS,
  PVP_DEFENSE_COOLDOWN_MS,
  PVP_LOSS_COIN,
  PVP_SEASON_MIN_FIGHTS,
  PVP_SEASON_RESET_KEEP,
  PVP_WIN_COIN,
} from './monster-rules'
import { toMonsterView, withRuleErrors, MonsterService } from './monster.service'
import { findPvpNpc, getSeasonReward, isPvpStage, PVP_NPCS } from './pvp-data'
import { isEligibleOpponent, IPvpCandidate, pickOpponents } from './pvp-matchmaking'
import { getSeason, getSeasonResetAt, isSeasonOver } from './pvp-season'
import { getQuestResetAt } from './quest-data'

const HISTORY_LIMIT = 20
const LEADERBOARD_LIMIT = 20
const DAY_MS = 24 * 60 * 60 * 1000

interface IPvpCandidateFull extends IPvpCandidate {
  userId: string | null
  displayName: string
  fighter: IFighter
}

// Names other players see: a user-chosen arena name, or a short tag from a hash of the user id.
// The username is never shown (PDPA).
const defaultDisplayName = (userId: string) =>
  `ผู้ฝึก#${createHash('sha256').update(userId).digest('hex').slice(0, 4)}`

const toOpponentView = (candidate: IPvpCandidateFull) => ({
  id: candidate.id,
  displayName: candidate.displayName,
  emoji: candidate.fighter.emoji,
  name: candidate.fighter.name,
  element: candidate.fighter.element,
  stats: candidate.fighter.stats,
  rating: candidate.rating,
  isNpc: candidate.isNpc,
})

const dayStart = (now: Date) => new Date(getQuestResetAt(now).getTime() - DAY_MS)

@Injectable()
export class PvpService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly monsterService: MonsterService,
    private readonly walletService: WalletService
  ) {}

  // Rating a user starts a season with: soft reset of their latest earlier season, else the start.
  private async initialRating(userId: string, season: string, etm: EntityManager) {
    const [previous] = await etm.query<{ rating: number }[]>(
      `SELECT "rating" FROM "pvp_ratings"
       WHERE "user_id" = $1 AND "season" < $2 AND "deleted_at" IS NULL
       ORDER BY "season" DESC LIMIT 1`,
      [userId, season]
    )
    return previous
      ? Math.round(START_RATING + (previous.rating - START_RATING) * PVP_SEASON_RESET_KEEP)
      : START_RATING
  }

  private async ensureRating(userId: string, season: string, etm: EntityManager) {
    await etm
      .createQueryBuilder()
      .insert()
      .into(PvpRatingEntity)
      .values({
        userId,
        season,
        rating: await this.initialRating(userId, season, etm),
        wins: 0,
        losses: 0,
      })
      .orIgnore()
      .execute()
  }

  // Locks rating rows in user-id order: two players challenging each other at once take the same
  // locks in the same order, so they wait for each other instead of deadlocking.
  private lockRatings(userIds: string[], season: string, etm: EntityManager) {
    return etm.find(PvpRatingEntity, {
      where: { userId: In(userIds), season },
      order: { userId: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    })
  }

  private async rankIn(season: string, rating: number, minFights: number, etm: EntityManager) {
    const [row] = await etm.query<{ better: number }[]>(
      `SELECT count(*)::int AS "better" FROM "pvp_ratings"
       WHERE "season" = $1 AND "rating" > $2 AND ("wins" + "losses") >= $3 AND "deleted_at" IS NULL`,
      [season, rating, minFights]
    )
    return row.better + 1
  }

  async getStatus(userId: string) {
    const now = new Date()
    const season = getSeason(now)
    const etm = this.dataSource.manager
    const [row, defense, attempts] = await Promise.all([
      etm.findOne(PvpRatingEntity, { where: { userId, season } }),
      etm.findOne(PvpDefenseEntity, { where: { userId } }),
      etm.count(PvpBattleEntity, {
        where: { attackerId: userId, createdAt: MoreThanOrEqual(dayStart(now)) },
      }),
    ])
    const rating = row?.rating ?? (await this.initialRating(userId, season, etm))
    const fights = (row?.wins ?? 0) + (row?.losses ?? 0)

    // Finished seasons with an unclaimed reward.
    const finished = await etm.query<
      { season: string; rating: number; wins: number; losses: number }[]
    >(
      `SELECT "season", "rating", "wins", "losses" FROM "pvp_ratings"
       WHERE "user_id" = $1 AND "season" < $2 AND "reward_claimed_at" IS NULL
         AND ("wins" + "losses") >= $3 AND "deleted_at" IS NULL
       ORDER BY "season" DESC LIMIT 6`,
      [userId, season, PVP_SEASON_MIN_FIGHTS]
    )
    const claimable = await Promise.all(
      finished.map(async entry => {
        const rank = await this.rankIn(entry.season, entry.rating, PVP_SEASON_MIN_FIGHTS, etm)
        const reward = getSeasonReward(rank, entry.wins + entry.losses)
        return { season: entry.season, rank, rating: entry.rating, reward }
      })
    )

    return {
      season,
      resetsAt: getSeasonResetAt(now),
      rating,
      wins: row?.wins ?? 0,
      losses: row?.losses ?? 0,
      rank: fights > 0 ? await this.rankIn(season, rating, 1, etm) : null,
      attemptsLeft: Math.max(0, PVP_DAILY_ATTEMPTS - attempts),
      defense: defense
        ? {
            displayName: defense.displayName,
            fighter: defense.fighter as unknown as IFighter,
            stage: defense.stage,
            setAt: defense.setAt,
            readyAt: new Date(defense.setAt.getTime() + PVP_DEFENSE_COOLDOWN_MS),
          }
        : null,
      claimableSeasons: claimable,
    }
  }

  async setDefense(userId: string, displayName?: string) {
    const now = new Date()
    const season = getSeason(now)
    await this.dataSource.transaction(async etm => {
      const monster = await this.monsterService.lockAndTickLatest(userId, now, etm)
      if (!monster || monster.diedAt || !isPvpStage(monster.stage)) {
        throw new BadRequestException('Your monster is too young for the arena')
      }
      const existing = await etm.findOne(PvpDefenseEntity, { where: { userId } })
      if (existing && now.getTime() - existing.setAt.getTime() < PVP_DEFENSE_COOLDOWN_MS) {
        throw new BadRequestException('Defense team was changed recently')
      }

      // Stamina counts as full: a defender is never weaker for having been away.
      const fighter = toFighter(
        { ...monster, stamina: MAX_STAMINA },
        await loadEquipmentBonus(userId, etm)
      )
      const name = displayName?.trim() || existing?.displayName || defaultDisplayName(userId)
      await etm.query(
        `INSERT INTO "pvp_defenses" ("user_id", "display_name", "fighter", "stage", "species_id", "set_at")
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT ("user_id") WHERE deleted_at IS NULL
         DO UPDATE SET "display_name" = $2, "fighter" = $3, "stage" = $4, "species_id" = $5,
                       "set_at" = $6, "updated_at" = now()`,
        [userId, name, JSON.stringify(fighter), monster.stage, monster.speciesId, now]
      )
      // Joining the ladder: defenders show up in the standings even before their first fight.
      await this.ensureRating(userId, season, etm)
    })
    // Read after the commit: getStatus uses its own connection and can't see the open transaction.
    return this.getStatus(userId)
  }

  // Real defenders of the challenger's form with this season's rating, plus the form's NPCs.
  private async loadCandidates(
    userId: string,
    stage: string,
    season: string,
    etm: EntityManager
  ): Promise<IPvpCandidateFull[]> {
    const rows = await etm.query<
      { id: string; user_id: string; display_name: string; fighter: IFighter; rating: number }[]
    >(
      `SELECT d."id", d."user_id", d."display_name", d."fighter",
              COALESCE(r."rating", ROUND($4::int + (COALESCE(p."rating", $4::int) - $4::int) * $5::numeric)::int) AS "rating"
       FROM "pvp_defenses" d
       LEFT JOIN "pvp_ratings" r
         ON r."user_id" = d."user_id" AND r."season" = $3 AND r."deleted_at" IS NULL
       LEFT JOIN LATERAL (
         SELECT "rating" FROM "pvp_ratings"
         WHERE "user_id" = d."user_id" AND "season" < $3 AND "deleted_at" IS NULL
         ORDER BY "season" DESC LIMIT 1
       ) p ON true
       WHERE d."user_id" <> $1 AND d."stage" = $2 AND d."deleted_at" IS NULL`,
      [userId, stage, season, START_RATING, PVP_SEASON_RESET_KEEP]
    )
    const real = rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      displayName: row.display_name,
      fighter: row.fighter,
      rating: row.rating,
      isNpc: false,
    }))
    const npcs = PVP_NPCS.filter(npc => (npc.stage as string) === stage).map(npc => ({
      id: npc.id,
      userId: null,
      displayName: npc.fighter.name,
      fighter: npc.fighter,
      rating: npc.rating,
      isNpc: true,
    }))
    return [...real, ...npcs]
  }

  private async fightsToday(userId: string, now: Date, etm: EntityManager) {
    const rows = await etm.query<{ opponent_id: string; fights: number }[]>(
      `SELECT "opponent_id", count(*)::int AS "fights" FROM "pvp_battles"
       WHERE "attacker_id" = $1 AND "created_at" >= $2 AND "deleted_at" IS NULL
       GROUP BY "opponent_id"`,
      [userId, dayStart(now)]
    )
    return new Map(rows.map(row => [row.opponent_id, row.fights]))
  }

  async getOpponents(userId: string) {
    const now = new Date()
    const season = getSeason(now)
    const etm = this.dataSource.manager
    const monster = await this.monsterService.getLatestAlive(userId, etm)
    if (!monster || !isPvpStage(monster.stage)) {
      return { opponents: [] }
    }
    const row = await etm.findOne(PvpRatingEntity, { where: { userId, season } })
    const rating = row?.rating ?? (await this.initialRating(userId, season, etm))
    const candidates = await this.loadCandidates(userId, monster.stage, season, etm)
    const picked = pickOpponents(candidates, rating, await this.fightsToday(userId, now, etm))
    return { opponents: picked.map(toOpponentView) }
  }

  async battle(userId: string, opponentId: string) {
    const now = new Date()
    const season = getSeason(now)
    return this.dataSource.transaction(async etm => {
      // The challenger's monster lock also queues this user's own requests, so the daily limit
      // below can't be overspent by parallel calls.
      const monster = await this.monsterService.lockAndTickLatest(userId, now, etm)
      if (!monster) {
        throw new NotFoundException('You do not have a monster yet')
      }
      withRuleErrors(() => assertCanBattle(monster))
      if (!isPvpStage(monster.stage)) {
        throw new BadRequestException('Your monster is too young for the arena')
      }
      const myDefense = await etm.findOne(PvpDefenseEntity, { where: { userId } })
      if (!myDefense) {
        throw new BadRequestException('Set your defense team first')
      }
      const attempts = await etm.count(PvpBattleEntity, {
        where: { attackerId: userId, createdAt: MoreThanOrEqual(dayStart(now)) },
      })
      if (attempts >= PVP_DAILY_ATTEMPTS) {
        throw new BadRequestException('Daily PvP limit reached')
      }

      // Resolve the opponent from the server's own data; the id from the client is only a pick.
      const npc = findPvpNpc(opponentId)
      let defense: PvpDefenseEntity | null = null
      if (!npc) {
        defense = isUUID(opponentId)
          ? await etm.findOne(PvpDefenseEntity, { where: { id: opponentId } })
          : null
      }
      const opponentStage: string | undefined = npc ? npc.stage : defense?.stage
      if (opponentStage !== (monster.stage as string) || defense?.userId === userId) {
        throw new BadRequestException('Opponent is not available')
      }

      const ratedUserIds = defense ? [userId, defense.userId] : [userId]
      for (const id of ratedUserIds) {
        await this.ensureRating(id, season, etm)
      }
      const rows = await this.lockRatings(ratedUserIds, season, etm)
      const attackerRow = rows.find(row => row.userId === userId)!
      const defenderRow = defense ? rows.find(row => row.userId === defense.userId)! : null
      const opponentRating = defenderRow?.rating ?? npc!.rating

      const opponentFights = await etm.count(PvpBattleEntity, {
        where: { attackerId: userId, opponentId, createdAt: MoreThanOrEqual(dayStart(now)) },
      })
      const eligible = isEligibleOpponent(
        { id: opponentId, rating: opponentRating, isNpc: !!npc },
        attackerRow.rating,
        new Map([[opponentId, opponentFights]])
      )
      if (!eligible) {
        throw new BadRequestException('Opponent is not available')
      }

      const player = toFighter(monster, await loadEquipmentBonus(userId, etm))
      const enemy = npc ? npc.fighter : (defense!.fighter as unknown as IFighter)
      const seed = randomInt(0, 2 ** 31)
      const result = simulateBattle(player, enemy, seed)
      const elo = calcElo(attackerRow.rating, opponentRating, result.won)

      const outcome = withRuleErrors(() =>
        applyPvpOutcome(monster, result.won, { opponentId, seed, rounds: result.rounds }, now)
      )
      const saved = await this.monsterService.saveState(monster, outcome.state, etm)
      await this.monsterService.saveEvents(saved, outcome.events, etm)

      const ratingBefore = attackerRow.rating
      attackerRow.rating = elo.attacker
      attackerRow.wins += result.won ? 1 : 0
      attackerRow.losses += result.won ? 0 : 1
      await etm.save(PvpRatingEntity, attackerRow)
      if (defenderRow) {
        defenderRow.rating = elo.defender
        defenderRow.wins += result.won ? 0 : 1
        defenderRow.losses += result.won ? 1 : 0
        await etm.save(PvpRatingEntity, defenderRow)
      }

      const reward = result.won ? PVP_WIN_COIN : PVP_LOSS_COIN
      const wallet = await this.walletService.change(
        userId,
        EnumWalletCurrency.COIN,
        reward,
        EnumWalletTransactionReason.PVP_REWARD,
        opponentId,
        etm
      )
      await etm.save(PvpBattleEntity, {
        season,
        attackerId: userId,
        defenderId: defense?.userId ?? null,
        opponentId,
        attackerName: myDefense.displayName,
        defenderName: defense?.displayName ?? npc!.fighter.name,
        seed,
        attacker: player as unknown as Record<string, unknown>,
        defender: enemy as unknown as Record<string, unknown>,
        won: result.won,
        attackerRatingBefore: ratingBefore,
        attackerRatingAfter: elo.attacker,
        defenderRatingBefore: opponentRating,
        defenderRatingAfter: defenderRow ? elo.defender : null,
        reward,
      })

      return {
        monster: toMonsterView(saved),
        battle: {
          won: result.won,
          rounds: result.rounds,
          events: result.events,
          player,
          enemy,
          reward,
        },
        rating: { before: ratingBefore, after: elo.attacker },
        attemptsLeft: Math.max(0, PVP_DAILY_ATTEMPTS - attempts - 1),
        wallet,
      }
    })
  }

  // Both sides' recent fights, from the caller's point of view. No user ids leave the server.
  async getHistory(userId: string) {
    const rows = await this.dataSource.manager.find(PvpBattleEntity, {
      where: [{ attackerId: userId }, { defenderId: userId }],
      order: { createdAt: 'DESC' },
      take: HISTORY_LIMIT,
    })
    return {
      battles: rows.map(row => {
        const isAttacker = row.attackerId === userId
        const opponent = (isAttacker ? row.defender : row.attacker) as unknown as IFighter
        return {
          id: row.id,
          season: row.season,
          role: isAttacker ? 'attacker' : 'defender',
          won: isAttacker ? row.won : !row.won,
          opponentName: isAttacker ? row.defenderName : row.attackerName,
          opponentEmoji: opponent.emoji,
          ratingBefore: isAttacker ? row.attackerRatingBefore : row.defenderRatingBefore,
          ratingAfter: isAttacker ? row.attackerRatingAfter : row.defenderRatingAfter,
          createdAt: row.createdAt,
        }
      }),
    }
  }

  // Replays a fight exactly from its seed and the two stored fighters.
  async getReplay(userId: string, battleId: string) {
    const row = isUUID(battleId)
      ? await this.dataSource.manager.findOne(PvpBattleEntity, {
          where: [
            { id: battleId, attackerId: userId },
            { id: battleId, defenderId: userId },
          ],
        })
      : null
    if (!row) {
      throw new NotFoundException('Battle not found')
    }
    const attacker = row.attacker as unknown as IFighter
    const defender = row.defender as unknown as IFighter
    const result = simulateBattle(attacker, defender, row.seed)
    return {
      role: row.attackerId === userId ? 'attacker' : 'defender',
      attackerWon: result.won,
      rounds: result.rounds,
      events: result.events,
      attacker,
      defender,
    }
  }

  async getLeaderboard(userId: string, requestedSeason?: string) {
    const season = requestedSeason ?? getSeason(new Date())
    const rows = await this.dataSource.query<
      {
        rank: number
        rating: number
        wins: number
        losses: number
        display_name: string | null
        emoji: string | null
        name: string | null
        is_me: boolean
      }[]
    >(
      `SELECT * FROM (
         SELECT RANK() OVER (ORDER BY r."rating" DESC)::int AS "rank", r."rating", r."wins", r."losses",
                d."display_name", d."fighter"->>'emoji' AS "emoji", d."fighter"->>'name' AS "name",
                (r."user_id" = $2) AS "is_me"
         FROM "pvp_ratings" r
         LEFT JOIN "pvp_defenses" d ON d."user_id" = r."user_id" AND d."deleted_at" IS NULL
         WHERE r."season" = $1 AND ("r"."wins" + r."losses") > 0 AND r."deleted_at" IS NULL
       ) ranked
       ORDER BY "rank", "wins" DESC
       LIMIT ${LEADERBOARD_LIMIT}`,
      [season, userId]
    )
    return {
      season,
      entries: rows.map(row => ({
        rank: row.rank,
        displayName: row.display_name ?? 'ผู้ฝึกนิรนาม',
        emoji: row.emoji,
        name: row.name,
        rating: row.rating,
        wins: row.wins,
        losses: row.losses,
        isMe: row.is_me,
      })),
    }
  }

  // Rewards for a finished season: rank among players with enough fights, paid once.
  async claimSeason(userId: string, season: string) {
    const now = new Date()
    if (!isSeasonOver(season, now)) {
      throw new BadRequestException('Season has not ended yet')
    }
    return this.dataSource.transaction(async etm => {
      const row = await etm.findOne(PvpRatingEntity, {
        where: { userId, season },
        lock: { mode: 'pessimistic_write' },
      })
      if (!row || row.rewardClaimedAt) {
        throw new BadRequestException('No season reward to claim')
      }
      const rank = await this.rankIn(season, row.rating, PVP_SEASON_MIN_FIGHTS, etm)
      const reward = getSeasonReward(rank, row.wins + row.losses)
      if (!reward) {
        throw new BadRequestException('Not enough fights to earn a season reward')
      }

      // The conditional update is what decides the claim; the row lock above queues racers.
      const claimed = await etm
        .createQueryBuilder()
        .update(PvpRatingEntity)
        .set({ rewardClaimedAt: now })
        .where('id = :id AND reward_claimed_at IS NULL', { id: row.id })
        .execute()
      if (!claimed.affected) {
        throw new BadRequestException('No season reward to claim')
      }
      let wallet = await this.walletService.change(
        userId,
        EnumWalletCurrency.COIN,
        reward.coin,
        EnumWalletTransactionReason.PVP_SEASON_REWARD,
        season,
        etm
      )
      wallet = await this.walletService.change(
        userId,
        EnumWalletCurrency.GEM,
        reward.gem,
        EnumWalletTransactionReason.PVP_SEASON_REWARD,
        season,
        etm
      )
      wallet = await this.walletService.change(
        userId,
        EnumWalletCurrency.RAID_TOKEN,
        reward.raidToken,
        EnumWalletTransactionReason.PVP_SEASON_REWARD,
        season,
        etm
      )
      return { season, rank, reward, wallet }
    })
  }
}
