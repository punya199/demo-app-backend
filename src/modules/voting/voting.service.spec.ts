import { BadRequestException, NotFoundException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { EntityManager } from 'typeorm'
import { EnumPollType, PollEntity } from '../../db/entities/poll.entity'
import { PollVoteEntity } from '../../db/entities/poll-vote.entity'
import { VotingService } from './voting.service'

describe('VotingService', () => {
  let service: VotingService
  let pollRepo: {
    findOne: jest.Mock
    find: jest.Mock
  }
  let pollVoteRepo: {
    findOne: jest.Mock
    update: jest.Mock
    save: jest.Mock
  }
  let jwtService: {
    verify: jest.Mock
  }
  let etm: {
    save: jest.Mock
    findOne: jest.Mock
  }

  beforeEach(async () => {
    pollRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
    }
    pollVoteRepo = {
      findOne: jest.fn(),
      update: jest.fn(),
      save: jest.fn((entity: object) => Promise.resolve({ id: 'vote-1', ...entity })),
    }
    jwtService = {
      verify: jest.fn(),
    }
    etm = {
      save: jest.fn((_entity: unknown, data: unknown) =>
        Promise.resolve(Array.isArray(data) ? data : { id: 'poll-1', ...(data as object) })
      ),
      findOne: jest.fn().mockResolvedValue({ id: 'poll-1', options: [] }),
    }

    const module = await Test.createTestingModule({
      providers: [
        VotingService,
        { provide: getRepositoryToken(PollEntity), useValue: pollRepo },
        { provide: getRepositoryToken(PollVoteEntity), useValue: pollVoteRepo },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile()

    service = module.get(VotingService)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('createPoll', () => {
    const baseParams = {
      title: 'Lunch spot?',
      pollType: EnumPollType.SINGLE,
      options: ['Pizza', 'Sushi'],
    }

    it('rejects maxSelections on a non-multiple poll', async () => {
      await expect(
        service.createPoll({ ...baseParams, maxSelections: 1 }, etm as unknown as EntityManager)
      ).rejects.toThrow(BadRequestException)
      expect(etm.save).not.toHaveBeenCalled()
    })

    it('rejects maxSelections greater than the number of options', async () => {
      await expect(
        service.createPoll(
          { ...baseParams, pollType: EnumPollType.MULTIPLE, maxSelections: 5 },
          etm as unknown as EntityManager
        )
      ).rejects.toThrow(BadRequestException)
      expect(etm.save).not.toHaveBeenCalled()
    })

    it('rejects a closesAt in the past', async () => {
      await expect(
        service.createPoll(
          { ...baseParams, closesAt: new Date(Date.now() - 1000) },
          etm as unknown as EntityManager
        )
      ).rejects.toThrow(BadRequestException)
      expect(etm.save).not.toHaveBeenCalled()
    })

    it('saves the poll and its options in order, and generates a slug', async () => {
      await service.createPoll(baseParams, etm as unknown as EntityManager)

      expect(etm.save).toHaveBeenCalledWith(
        PollEntity,
        expect.objectContaining({
          title: 'Lunch spot?',
          pollType: EnumPollType.SINGLE,
          maxSelections: null,
          slug: expect.any(String),
        })
      )
      expect(etm.save).toHaveBeenCalledWith(expect.anything(), [
        expect.objectContaining({ pollId: 'poll-1', label: 'Pizza', order: 0 }),
        expect.objectContaining({ pollId: 'poll-1', label: 'Sushi', order: 1 }),
      ])
    })

    it('keeps maxSelections for a valid multiple-choice poll', async () => {
      await service.createPoll(
        { ...baseParams, pollType: EnumPollType.MULTIPLE, maxSelections: 1 },
        etm as unknown as EntityManager
      )

      expect(etm.save).toHaveBeenCalledWith(
        PollEntity,
        expect.objectContaining({ maxSelections: 1, pollType: EnumPollType.MULTIPLE })
      )
    })
  })

  describe('getMyPolls', () => {
    it('filters polls by creatorId', async () => {
      pollRepo.find.mockResolvedValue([])

      await service.getMyPolls('user-1')

      expect(pollRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { creatorId: 'user-1' } })
      )
    })
  })

  describe('getPoll', () => {
    it('throws a NotFoundException when the poll does not exist', async () => {
      pollRepo.findOne.mockResolvedValue(null)

      await expect(service.getPoll('missing')).rejects.toThrow(NotFoundException)
    })
  })

  describe('resolveVoterIdentity', () => {
    it('resolves the userId from a valid access token cookie', () => {
      jwtService.verify.mockReturnValue({ 'user-id': 'user-1' })

      const identity = service.resolveVoterIdentity('valid-token', undefined)

      expect(identity).toEqual({ voterUserId: 'user-1', voterToken: null })
    })

    it('falls back to the anonymous cookie when the access token is invalid', () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid token')
      })

      const identity = service.resolveVoterIdentity('bad-token', 'existing-anon-token')

      expect(identity).toEqual({ voterUserId: null, voterToken: 'existing-anon-token' })
    })

    it('reuses an existing anonymous cookie when there is no access token', () => {
      const identity = service.resolveVoterIdentity(undefined, 'existing-anon-token')

      expect(identity).toEqual({ voterUserId: null, voterToken: 'existing-anon-token' })
    })

    it('generates a new anonymous token when neither cookie is present', () => {
      const identity = service.resolveVoterIdentity(undefined, undefined)

      expect(identity.voterUserId).toBeNull()
      expect(identity.voterToken).toEqual(identity.newAnonToken)
      expect(identity.newAnonToken).toEqual(expect.any(String))
    })
  })

  describe('getPublicPoll', () => {
    it('throws a NotFoundException for an unknown slug', async () => {
      pollRepo.findOne.mockResolvedValue(null)

      await expect(
        service.getPublicPoll('missing', { voterUserId: null, voterToken: 'anon-1' })
      ).rejects.toThrow(NotFoundException)
    })

    it('reports isClosed and the voter own prior vote', async () => {
      pollRepo.findOne.mockResolvedValue({
        id: 'poll-1',
        title: 'Lunch spot?',
        description: null,
        slug: 'abc123',
        pollType: EnumPollType.SINGLE,
        maxSelections: null,
        closedAt: new Date(),
        closesAt: null,
        options: [],
      })
      pollVoteRepo.findOne.mockResolvedValue({ selections: [{ optionId: 'a', rank: null }] })

      const result = await service.getPublicPoll('abc123', {
        voterUserId: null,
        voterToken: 'anon-1',
      })

      expect(result.poll.isClosed).toBe(true)
      expect(result.myVote).toEqual([{ optionId: 'a', rank: null }])
    })
  })

  describe('submitVote', () => {
    const openPoll = {
      id: 'poll-1',
      pollType: EnumPollType.SINGLE,
      maxSelections: null,
      closedAt: null,
      closesAt: null,
      options: [{ id: 'a' }, { id: 'b' }],
    }

    it('throws a NotFoundException for an unknown slug', async () => {
      pollRepo.findOne.mockResolvedValue(null)

      await expect(
        service.submitVote('missing', { optionIds: ['a'] }, { voterUserId: null, voterToken: 't' })
      ).rejects.toThrow(NotFoundException)
    })

    it('rejects a vote on a closed poll', async () => {
      pollRepo.findOne.mockResolvedValue({ ...openPoll, closedAt: new Date() })

      await expect(
        service.submitVote('slug', { optionIds: ['a'] }, { voterUserId: null, voterToken: 't' })
      ).rejects.toThrow(BadRequestException)
      expect(pollVoteRepo.save).not.toHaveBeenCalled()
    })

    it('inserts a new vote when the voter has not voted yet', async () => {
      pollRepo.findOne.mockResolvedValue(openPoll)
      pollVoteRepo.findOne.mockResolvedValue(null)

      await service.submitVote(
        'slug',
        { optionIds: ['a'] },
        { voterUserId: 'user-1', voterToken: null }
      )

      expect(pollVoteRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          pollId: 'poll-1',
          voterUserId: 'user-1',
          selections: [{ optionId: 'a', rank: null }],
        })
      )
      expect(pollVoteRepo.update).not.toHaveBeenCalled()
    })

    it('updates the existing vote when the voter has already voted (change of vote)', async () => {
      pollRepo.findOne.mockResolvedValue(openPoll)
      pollVoteRepo.findOne.mockResolvedValue({ id: 'vote-1', selections: [] })

      await service.submitVote(
        'slug',
        { optionIds: ['b'] },
        { voterUserId: 'user-1', voterToken: null }
      )

      expect(pollVoteRepo.update).toHaveBeenCalledWith('vote-1', {
        selections: [{ optionId: 'b', rank: null }],
      })
      expect(pollVoteRepo.save).not.toHaveBeenCalled()
    })
  })
})
