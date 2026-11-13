import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { ACHIEVEMENTS, DAILY_GOALS, IGoalDef, TRACK_GEMS } from './goals.config'

export interface IClaimPlan {
  claimKey: string
  gems: number
}

// Day boundary, defined here and nowhere else: the UTC calendar day.
export const utcDay = (now: Date) => now.toISOString().slice(0, 10)
export const dayBounds = (now: Date) => {
  const start = new Date(`${utcDay(now)}T00:00:00.000Z`)
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) }
}

export const dailyKey = (day: string, id: string) => `daily:${day}:${id}`
export const trackKey = (n: number) => `track:${n}`
export const achievementKey = (id: string) => `ach:${id}`

type Counts = Record<string, number>

const view = (def: IGoalDef, counts: Counts, claimed: boolean) => {
  const raw = counts[def.metric] ?? 0
  return {
    id: def.id,
    progress: Math.min(raw, def.target),
    target: def.target,
    gems: def.gems,
    complete: raw >= def.target,
    claimed,
  }
}

// Pure. `counts` are today's verified event counts; `claimed` holds every claim key the player has.
export const dailyList = (counts: Counts, claimed: Set<string>, day: string) =>
  DAILY_GOALS.map(d => view(d, counts, claimed.has(dailyKey(day, d.id))))

export function planDailyClaim(
  id: string,
  counts: Counts,
  claimed: Set<string>,
  day: string
): IClaimPlan {
  const def = DAILY_GOALS.find(d => d.id === id)
  if (!def) throw new NotFoundException('Unknown goal')
  const claimKey = dailyKey(day, id)
  if (claimed.has(claimKey)) throw new ConflictException('Already claimed today')
  if (!view(def, counts, false).complete) throw new BadRequestException('Goal not complete')
  return { claimKey, gems: def.gems }
}

// The track pays one day per UTC day, in order, and starts over after the last day. It advances
// only on a day when the player finished at least one daily goal (verified from server counts).
export function trackState(
  claimCount: number,
  lastClaimDay: string | null,
  day: string,
  activeToday: boolean
) {
  const index = claimCount % TRACK_GEMS.length
  return {
    day: index + 1,
    gems: TRACK_GEMS[index],
    claimedToday: lastClaimDay === day,
    claimable: lastClaimDay !== day && activeToday,
  }
}

export function planTrackClaim(
  claimCount: number,
  lastClaimDay: string | null,
  day: string,
  activeToday: boolean
): IClaimPlan {
  const s = trackState(claimCount, lastClaimDay, day, activeToday)
  if (s.claimedToday) throw new ConflictException('Already claimed today')
  if (!s.claimable) throw new BadRequestException('Finish a daily goal first')
  return { claimKey: trackKey(claimCount), gems: s.gems }
}

export const achievementList = (totals: Counts, claimed: Set<string>) =>
  ACHIEVEMENTS.map(a => view(a, totals, claimed.has(achievementKey(a.id))))

export function planAchievementClaim(id: string, totals: Counts, claimed: Set<string>): IClaimPlan {
  const def = ACHIEVEMENTS.find(a => a.id === id)
  if (!def) throw new NotFoundException('Unknown achievement')
  const claimKey = achievementKey(id)
  if (claimed.has(claimKey)) throw new ConflictException('Already claimed')
  if (!view(def, totals, false).complete) throw new BadRequestException('Achievement not reached')
  return { claimKey, gems: def.gems }
}
