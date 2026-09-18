import { computeBordaScores, computeOptionCounts } from './vote-tally.helper'

describe('computeOptionCounts', () => {
  const optionIds = ['a', 'b', 'c']

  it('includes options with zero votes', () => {
    const scores = computeOptionCounts([], optionIds)
    expect(scores).toEqual({ a: 0, b: 0, c: 0 })
  })

  it('counts one vote per selection, across single and multiple-choice ballots', () => {
    const scores = computeOptionCounts(
      [
        { selections: [{ optionId: 'a', rank: null }] },
        {
          selections: [
            { optionId: 'a', rank: null },
            { optionId: 'b', rank: null },
          ],
        },
        { selections: [{ optionId: 'b', rank: null }] },
      ],
      optionIds
    )
    expect(scores).toEqual({ a: 2, b: 2, c: 0 })
  })
})

describe('computeBordaScores', () => {
  it('gives the whole poll to the only option in a single-option poll', () => {
    const scores = computeBordaScores(
      [{ selections: [{ optionId: 'a', rank: 0 }] }, { selections: [{ optionId: 'a', rank: 0 }] }],
      ['a']
    )
    expect(scores).toEqual({ a: 0 })
  })

  it('scores rank 0 as N-1 points down to 0 for the last rank', () => {
    const scores = computeBordaScores(
      [
        {
          selections: [
            { optionId: 'a', rank: 0 },
            { optionId: 'b', rank: 1 },
            { optionId: 'c', rank: 2 },
          ],
        },
      ],
      ['a', 'b', 'c']
    )
    expect(scores).toEqual({ a: 2, b: 1, c: 0 })
  })

  it('produces a tie when two options are ranked identically across ballots', () => {
    const scores = computeBordaScores(
      [
        {
          selections: [
            { optionId: 'a', rank: 0 },
            { optionId: 'b', rank: 1 },
            { optionId: 'c', rank: 2 },
          ],
        },
        {
          selections: [
            { optionId: 'b', rank: 0 },
            { optionId: 'a', rank: 1 },
            { optionId: 'c', rank: 2 },
          ],
        },
      ],
      ['a', 'b', 'c']
    )
    expect(scores.a).toBe(scores.b)
    expect(scores.c).toBe(0)
  })

  it('still computes a nonzero score for an option nobody ever ranked first', () => {
    const scores = computeBordaScores(
      [
        {
          selections: [
            { optionId: 'a', rank: 0 },
            { optionId: 'b', rank: 1 },
            { optionId: 'c', rank: 2 },
          ],
        },
        {
          selections: [
            { optionId: 'c', rank: 0 },
            { optionId: 'a', rank: 1 },
            { optionId: 'b', rank: 2 },
          ],
        },
      ],
      ['a', 'b', 'c']
    )
    // 'b' is never rank 0 across either ballot, but still picked up points from being ranked mid/last.
    expect(scores.b).toBe(1)
    expect(scores.b).toBeGreaterThan(0)
  })

  it('returns 0 for options with no votes at all', () => {
    const scores = computeBordaScores([], ['a', 'b'])
    expect(scores).toEqual({ a: 0, b: 0 })
  })
})
