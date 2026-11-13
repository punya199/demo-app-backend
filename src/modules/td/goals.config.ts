// One place for every goal and achievement definition and amount. Placeholders until balancing
// (SPEC section 6). The client receives these via GET /td/goals, so what players see always
// matches what the server pays.
//
// DAY BOUNDARY: a goal "day" is a UTC calendar day (00:00:00Z to 24:00:00Z), the same boundary
// the daily free gacha pull uses. Daily goals reset at that instant.

/** What a goal counts. Every metric is derived on the server from rows it wrote itself. */
export type GoalMetric = 'battles_won' | 'pulls' | 'gear_upgrades' | 'stars' | 'heroes'

export interface IGoalDef {
  id: string
  metric: GoalMetric
  target: number
  gems: number
}

/** Daily goals: progress counts only events inside the current UTC day. */
export const DAILY_GOALS: readonly IGoalDef[] = [
  { id: 'win_battle', metric: 'battles_won', target: 1, gems: 30 },
  { id: 'pull_once', metric: 'pulls', target: 1, gems: 20 },
  { id: 'upgrade_gear', metric: 'gear_upgrades', target: 1, gems: 20 },
]

/** Gems for day 1 to 7 of the track. One claim per UTC day; after day 7 the track starts over. */
export const TRACK_GEMS: readonly number[] = [20, 30, 40, 50, 60, 80, 150]

/** Achievements: lifetime totals, paid once each. */
export const ACHIEVEMENTS: readonly IGoalDef[] = [
  { id: 'stars_3', metric: 'stars', target: 3, gems: 100 },
  { id: 'stars_9', metric: 'stars', target: 9, gems: 300 },
  { id: 'heroes_3', metric: 'heroes', target: 3, gems: 100 },
  { id: 'heroes_8', metric: 'heroes', target: 8, gems: 300 },
  { id: 'pulls_10', metric: 'pulls', target: 10, gems: 100 },
  { id: 'pulls_50', metric: 'pulls', target: 50, gems: 400 },
]
