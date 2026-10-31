// Pure ELO: the server alone decides who won and how many points move.

export const START_RATING = 1000
export const MIN_RATING = 0
// The challenger moves twice as much as the defender, so being offline is punished lightly.
export const K_ATTACKER = 32
export const K_DEFENDER = 16

export const expectedScore = (rating: number, opponentRating: number) =>
  1 / (1 + 10 ** ((opponentRating - rating) / 400))

export interface IEloResult {
  attacker: number
  defender: number
}

// New ratings after one fight. `defenderRating` of an NPC is its fixed rating; the caller just
// ignores the defender result for NPCs.
export const calcElo = (
  attackerRating: number,
  defenderRating: number,
  attackerWon: boolean
): IEloResult => {
  const attackerExpected = expectedScore(attackerRating, defenderRating)
  const defenderExpected = 1 - attackerExpected
  const attackerScore = attackerWon ? 1 : 0
  return {
    attacker: Math.max(
      MIN_RATING,
      Math.round(attackerRating + K_ATTACKER * (attackerScore - attackerExpected))
    ),
    defender: Math.max(
      MIN_RATING,
      Math.round(defenderRating + K_DEFENDER * (1 - attackerScore - defenderExpected))
    ),
  }
}
