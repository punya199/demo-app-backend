import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PollEntity } from '../../db/entities/poll.entity'
import { PollVoteEntity } from '../../db/entities/poll-vote.entity'
import { VotingController } from './voting.controller'
import { VotingPublicController } from './voting-public.controller'
import { VotingService } from './voting.service'

@Module({
  imports: [TypeOrmModule.forFeature([PollEntity, PollVoteEntity])],
  controllers: [VotingController, VotingPublicController],
  providers: [VotingService],
})
export class VotingModule {}
