import { PVP_SEASON_RESET_KEEP } from '../core/monster-rules'
import { START_RATING } from './elo'
import { getWeek } from '../boss/world-boss-data'

// A season is a Thai ISO week (Monday 00:00 UTC+7, no DST), written YYYY-Www. There is no job
// that rolls seasons over: a new week just has no rating rows yet. Seasons used to be months
// (YYYY-MM); those keys still sort before every YYYY-Www of the same year ('1' < 'W'), so old
// rows read as finished seasons.

export const getSeason = (now: Date) => getWeek(now).key

export const isSeasonOver = (season: string, now: Date) => season < getSeason(now)

// First instant of the next season (the next Thai Monday midnight).
export const getSeasonResetAt = (now: Date) => getWeek(now).endsAt

// Starting rating of a new season: half of last season's distance from the start rating.
export const softReset = (previousRating: number) =>
  Math.round(START_RATING + (previousRating - START_RATING) * PVP_SEASON_RESET_KEEP)
