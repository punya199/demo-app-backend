import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectRepository } from '@nestjs/typeorm'
import { nanoid } from 'nanoid'
import { EntityManager, In, Repository } from 'typeorm'
import { IBaseTokenPayload } from '../authentication/authentication.service'
import { EnumPollType, PollEntity } from '../../db/entities/poll.entity'
import { PollOptionEntity } from '../../db/entities/poll-option.entity'
import { PollVoteEntity } from '../../db/entities/poll-vote.entity'
import { CreatePollBodyDto } from './dto/create-poll.dto'
import { EditPollBodyDto } from './dto/edit-poll.dto'
import { SubmitVoteBodyDto } from './dto/submit-vote.dto'
import { buildVoteSelections } from './vote-selection.helper'
import { computeBordaScores, computeOptionCounts } from './vote-tally.helper'

export const VOTING_ANON_COOKIE = 'votingAnonId'

export interface IVoterIdentity {
  voterUserId: string | null
  voterToken: string | null
  // Set only when the caller had no anonymous token yet - the controller must set this as a cookie.
  newAnonToken?: string
}

@Injectable()
export class VotingService {
  constructor(
    @InjectRepository(PollEntity)
    private readonly pollRepository: Repository<PollEntity>,
    @InjectRepository(PollVoteEntity)
    private readonly pollVoteRepository: Repository<PollVoteEntity>,
    private readonly jwtService: JwtService
  ) {}

  // A missing/invalid/expired access token cookie just means "vote as anonymous" here - this
  // route has no guard, so it must never throw on a bad token the way JwtAccessTokenAuthGuard does.
  resolveVoterIdentity(accessTokenCookie?: string, anonTokenCookie?: string): IVoterIdentity {
    if (accessTokenCookie) {
      try {
        const payload = this.jwtService.verify<IBaseTokenPayload>(accessTokenCookie)
        return { voterUserId: payload['user-id'], voterToken: null }
      } catch {
        // invalid/expired token - fall through to anonymous identity
      }
    }
    if (anonTokenCookie) {
      return { voterUserId: null, voterToken: anonTokenCookie }
    }
    const newAnonToken = nanoid(21)
    return { voterUserId: null, voterToken: newAnonToken, newAnonToken }
  }

  async createPoll(params: CreatePollBodyDto, etm: EntityManager) {
    if (params.maxSelections && params.pollType !== EnumPollType.MULTIPLE) {
      throw new BadRequestException('maxSelections is only valid for multiple-choice polls')
    }
    if (params.maxSelections && params.maxSelections > params.options.length) {
      throw new BadRequestException('maxSelections cannot exceed the number of options')
    }
    if (params.closesAt && params.closesAt.getTime() <= Date.now()) {
      throw new BadRequestException('closesAt must be in the future')
    }

    const poll = await etm.save(PollEntity, {
      title: params.title,
      description: params.description ?? null,
      slug: nanoid(10),
      pollType: params.pollType,
      maxSelections:
        params.pollType === EnumPollType.MULTIPLE ? (params.maxSelections ?? null) : null,
      closesAt: params.closesAt ?? null,
      closedAt: null,
    })

    await etm.save(
      PollOptionEntity,
      params.options.map((label, order) => ({
        pollId: poll.id,
        label,
        order,
      }))
    )

    return { poll: await this.getPollByEntityManager(poll.id, etm) }
  }

  async getPoll(pollId: string) {
    const poll = await this.pollRepository.findOne({
      where: { id: pollId },
      relations: { options: true },
      order: { options: { order: 'ASC' } },
    })
    if (!poll) {
      throw new NotFoundException('Poll not found')
    }
    return poll
  }

  private async getPollByEntityManager(pollId: string, etm: EntityManager) {
    const poll = await etm.findOne(PollEntity, {
      where: { id: pollId },
      relations: { options: true },
      order: { options: { order: 'ASC' } },
    })
    if (!poll) {
      throw new NotFoundException('Poll not found')
    }
    return poll
  }

  async editPoll(pollId: string, params: EditPollBodyDto, userId: string, etm: EntityManager) {
    const poll = await etm.findOne(PollEntity, { where: { id: pollId } })
    if (!poll) {
      throw new NotFoundException('Poll not found')
    }
    if (poll.creatorId !== userId) {
      throw new ForbiddenException('Only the poll creator can edit it')
    }

    const updates: Partial<Pick<PollEntity, 'title' | 'description'>> = {}
    if (params.title !== undefined) {
      updates.title = params.title
    }
    if (params.description !== undefined) {
      updates.description = params.description
    }
    if (Object.keys(updates).length) {
      await etm.update(PollEntity, pollId, updates)
    }

    if (params.options !== undefined) {
      const voteCount = await etm.count(PollVoteEntity, { where: { pollId } })
      if (voteCount > 0) {
        throw new BadRequestException('Options cannot be changed once voting has started')
      }
      await etm.softDelete(PollOptionEntity, { pollId })
      await etm.save(
        PollOptionEntity,
        params.options.map((label, order) => ({ pollId, label, order }))
      )
    }

    return { poll: await this.getPollByEntityManager(pollId, etm) }
  }

  async getMyPolls(userId: string) {
    const polls = await this.pollRepository.find({
      where: { creatorId: userId },
      relations: { options: true },
      order: { createdAt: 'DESC', options: { order: 'ASC' } },
    })

    const votedPollIds = await this.pollIdsWithVotes(polls.map(poll => poll.id))
    return {
      polls: polls.map(poll => ({ ...poll, hasVotes: votedPollIds.has(poll.id) })),
    }
  }

  async getPollForCreator(pollId: string, userId: string) {
    const poll = await this.pollRepository.findOne({
      where: { id: pollId },
      relations: { options: true },
      order: { options: { order: 'ASC' } },
    })
    if (!poll) {
      throw new NotFoundException('Poll not found')
    }
    if (poll.creatorId !== userId) {
      throw new ForbiddenException('Only the poll creator can view this')
    }

    const hasVotes = (await this.pollIdsWithVotes([poll.id])).has(poll.id)
    return { poll: { ...poll, hasVotes } }
  }

  private async pollIdsWithVotes(pollIds: string[]): Promise<Set<string>> {
    if (!pollIds.length) {
      return new Set()
    }
    const votes = await this.pollVoteRepository.find({
      where: { pollId: In(pollIds) },
      select: { pollId: true },
    })
    return new Set(votes.map(vote => vote.pollId))
  }

  async closePoll(pollId: string, userId: string) {
    const poll = await this.pollRepository.findOne({ where: { id: pollId } })
    if (!poll) {
      throw new NotFoundException('Poll not found')
    }
    if (poll.creatorId !== userId) {
      throw new ForbiddenException('Only the poll creator can close it')
    }
    if (!poll.closedAt) {
      await this.pollRepository.update(pollId, { closedAt: new Date() })
    }
    return { poll: await this.getPoll(pollId) }
  }

  async getPublicPoll(slug: string, identity: IVoterIdentity) {
    const poll = await this.pollRepository.findOne({
      where: { slug },
      relations: { options: true },
      order: { options: { order: 'ASC' } },
    })
    if (!poll) {
      throw new NotFoundException('Poll not found')
    }

    const existingVote = await this.findExistingVote(poll.id, identity)

    return {
      poll: {
        id: poll.id,
        title: poll.title,
        description: poll.description,
        slug: poll.slug,
        pollType: poll.pollType,
        maxSelections: poll.maxSelections,
        isClosed: !this.isPollOpen(poll),
        options: poll.options,
      },
      myVote: existingVote?.selections ?? null,
    }
  }

  async submitVote(slug: string, params: SubmitVoteBodyDto, identity: IVoterIdentity) {
    const poll = await this.pollRepository.findOne({
      where: { slug },
      relations: { options: true },
    })
    if (!poll) {
      throw new NotFoundException('Poll not found')
    }
    if (!this.isPollOpen(poll)) {
      throw new BadRequestException('This poll is closed')
    }

    const selections = buildVoteSelections({
      pollType: poll.pollType,
      optionIds: params.optionIds,
      pollOptionIds: poll.options.map(option => option.id),
      maxSelections: poll.maxSelections,
    })

    const existingVote = await this.findExistingVote(poll.id, identity)
    if (existingVote) {
      await this.pollVoteRepository.update(existingVote.id, { selections })
      return { vote: { ...existingVote, selections } }
    }

    const vote = await this.pollVoteRepository.save({
      pollId: poll.id,
      voterUserId: identity.voterUserId,
      voterToken: identity.voterToken,
      selections,
    })
    return { vote }
  }

  async getResults(slug: string, identity: IVoterIdentity) {
    const poll = await this.pollRepository.findOne({
      where: { slug },
      relations: { options: true },
      order: { options: { order: 'ASC' } },
    })
    if (!poll) {
      throw new NotFoundException('Poll not found')
    }

    const myVote = await this.findExistingVote(poll.id, identity)
    if (!myVote) {
      throw new ForbiddenException('Vote on this poll before viewing its results')
    }

    const votes = await this.pollVoteRepository.find({ where: { pollId: poll.id } })
    const optionIds = poll.options.map(option => option.id)
    const scores =
      poll.pollType === EnumPollType.RANKING
        ? computeBordaScores(votes, optionIds)
        : computeOptionCounts(votes, optionIds)

    return {
      pollType: poll.pollType,
      totalVotes: votes.length,
      results: poll.options.map(option => ({
        optionId: option.id,
        label: option.label,
        score: scores[option.id] ?? 0,
      })),
    }
  }

  private findExistingVote(pollId: string, identity: IVoterIdentity) {
    // resolveVoterIdentity always sets exactly one of voterUserId/voterToken.
    return this.pollVoteRepository.findOne({
      where: identity.voterUserId
        ? { pollId, voterUserId: identity.voterUserId }
        : { pollId, voterToken: identity.voterToken as string },
    })
  }

  private isPollOpen(poll: PollEntity): boolean {
    if (poll.closedAt) {
      return false
    }
    if (poll.closesAt && poll.closesAt.getTime() <= Date.now()) {
      return false
    }
    return true
  }
}
