import { EntityManager, In } from 'typeorm'
import { PvpBattleEntity } from '../../../db/entities/pvp-battle.entity'
import { PvpDefenseEntity } from '../../../db/entities/pvp-defense.entity'
import { PvpRatingEntity } from '../../../db/entities/pvp-rating.entity'
import { IFighter } from '../battle/battle-stats'
import { defaultDisplayName } from '../core/display-name'
import { PVP_SEASON_RESET_KEEP } from '../core/monster-rules'
import { spriteOfSpecies } from '../core/species-data'
import { getQuestResetAt } from '../adventure/quest-data'
import { arenaSpecOfFighter } from './arena-fighter'
import { IArenaFighterSpec } from './arena-types'
import { START_RATING } from './elo'
import { PVP_NPCS } from './pvp-data'
import { ILoadout } from '../equipment/costume-data'
import { IPvpCandidate } from './pvp-matchmaking'

const DAY_MS = 24 * 60 * 60 * 1000

export interface IPvpCandidateFull extends IPvpCandidate {
  userId: string | null
  displayName: string
  fighter: IFighter
  // The defender's pixel-art sprite (null for NPCs and forms without art).
  sprite: string | null
}

export const dayStart = (now: Date) => new Date(getQuestResetAt(now).getTime() - DAY_MS)

// A defense set before snapshots carried a loadout fights with its line's default skills.
// A snapshot stored before sprites gets its sprite from the defender's species.
export const arenaDefenseOf = (defense: PvpDefenseEntity): IArenaFighterSpec => {
  const spec =
    (defense.arenaFighter as unknown as IArenaFighterSpec | null) ??
    arenaSpecOfFighter(defense.fighter as unknown as IFighter)
  return spec.sprite === undefined ? { ...spec, sprite: spriteOfSpecies(defense.speciesId) } : spec
}

// Rating a user starts a season with: soft reset of their latest earlier season, else the start.
export async function initialRating(userId: string, season: string, etm: EntityManager) {
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

export async function ensureRating(userId: string, season: string, etm: EntityManager) {
  await etm
    .createQueryBuilder()
    .insert()
    .into(PvpRatingEntity)
    .values({
      userId,
      season,
      rating: await initialRating(userId, season, etm),
      wins: 0,
      losses: 0,
    })
    .orIgnore()
    .execute()
}

// Locks rating rows in user-id order: two players challenging each other at once take the same
// locks in the same order, so they wait for each other instead of deadlocking.
export function lockRatings(userIds: string[], season: string, etm: EntityManager) {
  return etm.find(PvpRatingEntity, {
    where: { userId: In(userIds), season },
    order: { userId: 'ASC' },
    lock: { mode: 'pessimistic_write' },
  })
}

export async function rankIn(
  season: string,
  rating: number,
  minFights: number,
  etm: EntityManager
) {
  const [row] = await etm.query<{ better: number }[]>(
    `SELECT count(*)::int AS "better" FROM "pvp_ratings"
       WHERE "season" = $1 AND "rating" > $2 AND ("wins" + "losses") >= $3 AND "deleted_at" IS NULL`,
    [season, rating, minFights]
  )
  return row.better + 1
}

// Real defenders of the challenger's form with this season's rating, plus the form's NPCs.
export async function loadCandidates(
  userId: string,
  stage: string,
  season: string,
  etm: EntityManager
): Promise<IPvpCandidateFull[]> {
  const rows = await etm.query<
    {
      id: string
      user_id: string
      display_name: string | null
      fighter: IFighter
      species_id: string
      rating: number
    }[]
  >(
    `SELECT d."id", d."user_id", pr."display_name", d."fighter", d."species_id",
              COALESCE(r."rating", ROUND($4::int + (COALESCE(p."rating", $4::int) - $4::int) * $5::numeric)::int) AS "rating"
       FROM "pvp_defenses" d
       LEFT JOIN "player_profiles" pr ON pr."user_id" = d."user_id" AND pr."deleted_at" IS NULL
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
    displayName: row.display_name ?? defaultDisplayName(row.user_id),
    fighter: row.fighter,
    sprite: spriteOfSpecies(row.species_id),
    rating: row.rating,
    isNpc: false,
  }))
  const npcs = PVP_NPCS.filter(npc => (npc.stage as string) === stage).map(npc => ({
    id: npc.id,
    userId: null,
    displayName: npc.fighter.name,
    fighter: npc.fighter,
    sprite: null,
    rating: npc.rating,
    isNpc: true,
  }))
  return [...real, ...npcs]
}

export async function fightsToday(userId: string, now: Date, etm: EntityManager) {
  const rows = await etm.query<{ opponent_id: string; fights: number }[]>(
    `SELECT "opponent_id", count(*)::int AS "fights" FROM "pvp_battles"
       WHERE "attacker_id" = $1 AND "created_at" >= $2 AND "deleted_at" IS NULL
       GROUP BY "opponent_id"`,
    [userId, dayStart(now)]
  )
  return new Map(rows.map(row => [row.opponent_id, row.fights]))
}

export const toOpponentView = (candidate: IPvpCandidateFull, costume: ILoadout | null) => ({
  id: candidate.id,
  displayName: candidate.displayName,
  emoji: candidate.fighter.emoji,
  sprite: candidate.sprite,
  name: candidate.fighter.name,
  nickname: candidate.fighter.nickname ?? null,
  costume,
  element: candidate.fighter.element,
  stats: candidate.fighter.stats,
  rating: candidate.rating,
  isNpc: candidate.isNpc,
})

export const toHistoryEntry = (row: PvpBattleEntity, userId: string) => {
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
}
