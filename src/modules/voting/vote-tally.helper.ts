import { IPollVoteSelection } from '../../db/entities/poll-vote.entity'

interface ITalliableVote {
  selections: IPollVoteSelection[]
}

// Single/multiple-choice: how many votes picked each option. Options with zero votes are still
// present in the result, at 0.
export const computeOptionCounts = (
  votes: ITalliableVote[],
  optionIds: string[]
): Record<string, number> => {
  const scores: Record<string, number> = Object.fromEntries(optionIds.map(id => [id, 0]))
  for (const vote of votes) {
    for (const selection of vote.selections) {
      if (selection.optionId in scores) {
        scores[selection.optionId] += 1
      }
    }
  }
  return scores
}

// Ranking: Borda count. A ballot's rank-0 (most preferred) choice earns (N-1) points, the next
// earns (N-2), ... the last-ranked option earns 0. Summed across all ballots, incrementally -
// no need to reprocess every ballot per vote, which is why this beats instant-runoff here.
export const computeBordaScores = (
  votes: ITalliableVote[],
  optionIds: string[]
): Record<string, number> => {
  const numOptions = optionIds.length
  const scores: Record<string, number> = Object.fromEntries(optionIds.map(id => [id, 0]))
  for (const vote of votes) {
    for (const selection of vote.selections) {
      if (selection.rank === null || !(selection.optionId in scores)) {
        continue
      }
      scores[selection.optionId] += numOptions - 1 - selection.rank
    }
  }
  return scores
}
