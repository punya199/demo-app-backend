import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { EntityManager } from 'typeorm'
import { EnumPollType, PollEntity } from '../../db/entities/poll.entity'
import { VotingService } from './voting.service'

describe('VotingService', () => {
  let service: VotingService
  let pollRepo: {
    findOne: jest.Mock
    find: jest.Mock
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
    etm = {
      save: jest.fn((_entity: unknown, data: unknown) =>
        Promise.resolve(Array.isArray(data) ? data : { id: 'poll-1', ...(data as object) })
      ),
      findOne: jest.fn().mockResolvedValue({ id: 'poll-1', options: [] }),
    }

    const module = await Test.createTestingModule({
      providers: [VotingService, { provide: getRepositoryToken(PollEntity), useValue: pollRepo }],
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
})
