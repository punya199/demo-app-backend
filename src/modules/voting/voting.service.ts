import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { nanoid } from 'nanoid'
import { EntityManager, Repository } from 'typeorm'
import { EnumPollType, PollEntity } from '../../db/entities/poll.entity'
import { PollOptionEntity } from '../../db/entities/poll-option.entity'
import { CreatePollBodyDto } from './dto/create-poll.dto'

@Injectable()
export class VotingService {
  constructor(
    @InjectRepository(PollEntity)
    private readonly pollRepository: Repository<PollEntity>
  ) {}

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

  async getMyPolls(userId: string) {
    const polls = await this.pollRepository.find({
      where: { creatorId: userId },
      relations: { options: true },
      order: { createdAt: 'DESC', options: { order: 'ASC' } },
    })
    return { polls }
  }
}
