import { EntityManager } from 'typeorm'
import { getQuestResetAt } from './quest-data'

const DAY_MS = 24 * 60 * 60 * 1000

// Fights of a mode ('raid', 'world_boss') the user has done today (Thai day), counted from the
// battle log across all of their monsters. Callers hold the monster row lock, so the count can't be
// overspent by parallel requests.
export const countFightsToday = async (
  userId: string,
  mode: 'raid' | 'world_boss',
  now: Date,
  etm: EntityManager
) => {
  const since = new Date(getQuestResetAt(now).getTime() - DAY_MS)
  const [row] = await etm.query<{ fights: number }[]>(
    `SELECT count(*)::int AS "fights" FROM "monster_logs" l
     JOIN "monsters" m ON m."id" = l."monster_id"
     WHERE m."owner_id" = $1 AND l."type" = 'battle' AND l."payload"->>'mode' = $2
       AND l."created_at" >= $3 AND l."deleted_at" IS NULL`,
    [userId, mode, since]
  )
  return row.fights
}
