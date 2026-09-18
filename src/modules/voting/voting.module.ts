import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PollEntity } from '../../db/entities/poll.entity'
import { VotingController } from './voting.controller'
import { VotingService } from './voting.service'

@Module({
  imports: [TypeOrmModule.forFeature([PollEntity])],
  controllers: [VotingController],
  providers: [VotingService],
})
export class VotingModule {}
