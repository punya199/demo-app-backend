import { DataSource, EntityManager } from 'typeorm'
import { WorldBossDamageEntity } from '../../../db/entities/world-boss-damage.entity'
import { WorldBossEntity } from '../../../db/entities/world-boss.entity'
import {
  calcWorldBossReward,
  claimRolls,
  getWeek,
  getWorldBossArena,
  getWorldBossOfWeek,
  IWorldBoss,
} from './world-boss-data'
import { buildBossDetail } from './boss-detail'

export const RANKING_LIMIT = 20

// The row for this week's boss, created by whoever asks first (no job).
export async function ensureCurrent(now: Date, etm: EntityManager) {
  const week = getWeek(now)
  const boss = getWorldBossOfWeek(week)
  await etm
    .createQueryBuilder()
    .insert()
    .into(WorldBossEntity)
    .values({
      week: week.key,
      bossId: boss.id,
      maxHp: boss.hp,
      hp: boss.hp,
      startsAt: week.startsAt,
      endsAt: week.endsAt,
    })
    .orIgnore()
    .execute()
  return etm.findOneOrFail(WorldBossEntity, { where: { week: week.key } })
}

export async function rankOf(worldBossId: string, damage: number, etm: EntityManager) {
  const [row] = await etm.query<{ better: number }[]>(
    `SELECT count(*)::int AS "better" FROM "world_boss_damage"
     WHERE "world_boss_id" = $1 AND "damage" > $2 AND "deleted_at" IS NULL`,
    [worldBossId, damage]
  )
  return row.better + 1
}

export function isEnded(boss: WorldBossEntity, now: Date) {
  return !!boss.defeatedAt || now >= boss.endsAt
}

export function previewReward(
  boss: WorldBossEntity,
  row: WorldBossDamageEntity,
  rank: number,
  userId: string
) {
  const rolls = claimRolls(boss.id, userId)
  return calcWorldBossReward(
    {
      rank,
      hits: row.hits,
      defeated: !!boss.defeatedAt,
      isKillingBlow: boss.killedByUserId === userId,
    },
    rolls.pieceRoll
  )
}

// Stats and skills for the boss card (the HP in `stats` is the week's shared pool).
export function detailOf(definition: IWorldBoss, hp: number) {
  const arena = getWorldBossArena(definition, hp)
  return buildBossDetail(
    { hp, atk: arena.atk, def: arena.def, spd: arena.spd },
    definition.arenaSkills,
    arena.passive,
    definition.arenaDodge
  )
}

// Rows of a week's damage ranking.
export function rankingRows(week: string, dataSource: DataSource) {
  return dataSource.query<
    {
      rank: number
      user_id: string
      damage: number
      hits: number
      display_name: string | null
      emoji: string | null
    }[]
  >(
    `SELECT * FROM (
       SELECT RANK() OVER (ORDER BY d."damage" DESC)::int AS "rank", d."user_id", d."damage", d."hits",
              pr."display_name", p."fighter"->>'emoji' AS "emoji"
       FROM "world_boss_damage" d
       JOIN "world_bosses" b ON b."id" = d."world_boss_id"
       LEFT JOIN "pvp_defenses" p ON p."user_id" = d."user_id" AND p."deleted_at" IS NULL
       LEFT JOIN "player_profiles" pr ON pr."user_id" = d."user_id" AND pr."deleted_at" IS NULL
       WHERE b."week" = $1 AND d."deleted_at" IS NULL AND b."deleted_at" IS NULL
     ) ranked
     ORDER BY "rank", "hits" DESC
     LIMIT ${RANKING_LIMIT}`,
    [week]
  )
}
