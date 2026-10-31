import {
  PVP_MAX_FIGHTS_PER_OPPONENT_PER_DAY,
  PVP_OPPONENT_COUNT,
  PVP_RATING_WINDOW,
} from './monster-rules'

export interface IPvpCandidate {
  id: string
  rating: number
  isNpc: boolean
}

// Whether `candidate` may be challenged right now. Used both to build the offer list and to
// re-check the opponent id a client sends, so a made-up id can't skip the rules.
export const isEligibleOpponent = (
  candidate: IPvpCandidate,
  myRating: number,
  fightsToday: ReadonlyMap<string, number>
) =>
  candidate.isNpc ||
  (Math.abs(candidate.rating - myRating) <= PVP_RATING_WINDOW &&
    (fightsToday.get(candidate.id) ?? 0) < PVP_MAX_FIGHTS_PER_OPPONENT_PER_DAY)

// Nearest real players first (ties by id so the list is stable), then NPCs fill what is missing.
// `candidates` must already be the same form as the challenger.
export const pickOpponents = <T extends IPvpCandidate>(
  candidates: T[],
  myRating: number,
  fightsToday: ReadonlyMap<string, number>,
  count = PVP_OPPONENT_COUNT
): T[] => {
  const byCloseness = (a: T, b: T) =>
    Math.abs(a.rating - myRating) - Math.abs(b.rating - myRating) || a.id.localeCompare(b.id)
  const eligible = candidates.filter(candidate =>
    isEligibleOpponent(candidate, myRating, fightsToday)
  )
  const real = eligible.filter(candidate => !candidate.isNpc).sort(byCloseness)
  const npcs = eligible.filter(candidate => candidate.isNpc).sort(byCloseness)
  return [...real, ...npcs].slice(0, count)
}
