import { EntityManager } from 'typeorm'
import { getQuestDayStart } from '../adventure/quest-data'

const HOUR_MS = 60 * 60 * 1000

// Attempts of a boss mode refill every `resetHours`, on windows counted from Thai midnight (so 3h
// and 6h windows line up with the clock: 00:00, 03:00, ... / 00:00, 06:00, ...).
export const getWindow = (now: Date, resetHours: number) => {
  const windowMs = resetHours * HOUR_MS
  const dayStart = getQuestDayStart(now).getTime()
  const startsAt = dayStart + Math.floor((now.getTime() - dayStart) / windowMs) * windowMs
  return { startsAt: new Date(startsAt), resetsAt: new Date(startsAt + windowMs) }
}

// Fights of a mode ('raid', 'world_boss') the user has done in the current window, counted from
// the battle log across all of their monsters. Callers hold the monster row lock, so the count
// can't be overspent by parallel requests.
export const countFightsInWindow = async (
  userId: string,
  mode: 'raid' | 'world_boss',
  resetHours: number,
  now: Date,
  etm: EntityManager
) => {
  const [row] = await etm.query<{ fights: number }[]>(
    `SELECT count(*)::int AS "fights" FROM "monster_logs" l
     JOIN "monsters" m ON m."id" = l."monster_id"
     WHERE m."owner_id" = $1 AND l."type" = 'battle' AND l."payload"->>'mode' = $2
       AND l."created_at" >= $3 AND l."deleted_at" IS NULL`,
    [userId, mode, getWindow(now, resetHours).startsAt]
  )
  return row.fights
}
