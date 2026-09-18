import { BadRequestException } from '@nestjs/common'
import { EnumPollType } from '../../db/entities/poll.entity'
import { IPollVoteSelection } from '../../db/entities/poll-vote.entity'

// Turns a voter's chosen option ids into the stored selections shape, validating them against
// the poll's type. For single/multiple, order is irrelevant. For ranking, `optionIds` order IS
// the preference (most-preferred first) and becomes each option's rank.
export const buildVoteSelections = (params: {
  pollType: EnumPollType
  optionIds: string[]
  pollOptionIds: string[]
  maxSelections: number | null
}): IPollVoteSelection[] => {
  const { pollType, optionIds, pollOptionIds, maxSelections } = params

  const validOptionIds = new Set(pollOptionIds)
  const uniqueOptionIds = new Set(optionIds)
  if (uniqueOptionIds.size !== optionIds.length) {
    throw new BadRequestException('Duplicate option in vote')
  }
  for (const optionId of optionIds) {
    if (!validOptionIds.has(optionId)) {
      throw new BadRequestException('Vote references an option that does not belong to this poll')
    }
  }

  if (pollType === EnumPollType.SINGLE) {
    if (optionIds.length !== 1) {
      throw new BadRequestException('A single-choice vote must select exactly one option')
    }
  }

  if (pollType === EnumPollType.MULTIPLE) {
    const limit = maxSelections ?? pollOptionIds.length
    if (optionIds.length > limit) {
      throw new BadRequestException(`A vote can select at most ${limit} option(s)`)
    }
  }

  if (pollType === EnumPollType.RANKING) {
    if (optionIds.length !== pollOptionIds.length) {
      throw new BadRequestException('A ranking vote must rank every option')
    }
  }

  const isRanking = pollType === EnumPollType.RANKING
  return optionIds.map((optionId, index) => ({
    optionId,
    rank: isRanking ? index : null,
  }))
}
