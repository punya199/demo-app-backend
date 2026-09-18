import { BadRequestException } from '@nestjs/common'
import { EnumPollType } from '../../db/entities/poll.entity'
import { buildVoteSelections } from './vote-selection.helper'

describe('buildVoteSelections', () => {
  const pollOptionIds = ['a', 'b', 'c']

  it('rejects a selection that does not belong to the poll', () => {
    expect(() =>
      buildVoteSelections({
        pollType: EnumPollType.SINGLE,
        optionIds: ['z'],
        pollOptionIds,
        maxSelections: null,
      })
    ).toThrow(BadRequestException)
  })

  it('rejects a duplicate option id', () => {
    expect(() =>
      buildVoteSelections({
        pollType: EnumPollType.MULTIPLE,
        optionIds: ['a', 'a'],
        pollOptionIds,
        maxSelections: null,
      })
    ).toThrow(BadRequestException)
  })

  describe('single-choice', () => {
    it('rejects more than one option', () => {
      expect(() =>
        buildVoteSelections({
          pollType: EnumPollType.SINGLE,
          optionIds: ['a', 'b'],
          pollOptionIds,
          maxSelections: null,
        })
      ).toThrow(BadRequestException)
    })

    it('accepts exactly one option, rank is null', () => {
      const result = buildVoteSelections({
        pollType: EnumPollType.SINGLE,
        optionIds: ['a'],
        pollOptionIds,
        maxSelections: null,
      })
      expect(result).toEqual([{ optionId: 'a', rank: null }])
    })
  })

  describe('multiple-choice', () => {
    it('rejects exceeding maxSelections', () => {
      expect(() =>
        buildVoteSelections({
          pollType: EnumPollType.MULTIPLE,
          optionIds: ['a', 'b'],
          pollOptionIds,
          maxSelections: 1,
        })
      ).toThrow(BadRequestException)
    })

    it('allows up to the full option count when maxSelections is null', () => {
      const result = buildVoteSelections({
        pollType: EnumPollType.MULTIPLE,
        optionIds: ['a', 'b', 'c'],
        pollOptionIds,
        maxSelections: null,
      })
      expect(result).toHaveLength(3)
      expect(result.every(selection => selection.rank === null)).toBe(true)
    })
  })

  describe('ranking', () => {
    it('rejects an incomplete ranking', () => {
      expect(() =>
        buildVoteSelections({
          pollType: EnumPollType.RANKING,
          optionIds: ['a', 'b'],
          pollOptionIds,
          maxSelections: null,
        })
      ).toThrow(BadRequestException)
    })

    it('ranks by array order, most-preferred first', () => {
      const result = buildVoteSelections({
        pollType: EnumPollType.RANKING,
        optionIds: ['c', 'a', 'b'],
        pollOptionIds,
        maxSelections: null,
      })
      expect(result).toEqual([
        { optionId: 'c', rank: 0 },
        { optionId: 'a', rank: 1 },
        { optionId: 'b', rank: 2 },
      ])
    })
  })
})
