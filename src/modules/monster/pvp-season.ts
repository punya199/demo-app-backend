import { PVP_SEASON_RESET_KEEP } from './monster-rules'
import { START_RATING } from './elo'

// A season is a calendar month in Thai time (UTC+7, no DST), written YYYY-MM. There is no job
// that rolls seasons over: a new month just has no rating rows yet.

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000

export const getSeason = (now: Date) =>
  new Date(now.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 7)

export const isSeasonOver = (season: string, now: Date) => season < getSeason(now)

// First instant of the next season (the next Thai midnight on the 1st).
export const getSeasonResetAt = (now: Date) => {
  const [year, month] = getSeason(now).split('-').map(Number)
  return new Date(Date.UTC(year, month, 1) - BANGKOK_OFFSET_MS)
}

// Starting rating of a new season: half of last season's distance from the start rating.
export const softReset = (previousRating: number) =>
  Math.round(START_RATING + (previousRating - START_RATING) * PVP_SEASON_RESET_KEEP)
