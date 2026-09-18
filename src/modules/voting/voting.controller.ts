import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { EnumPermissionFeatureName } from '../../db/entities/permissions'
import { AuthUserPermission, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import { CreatePollBodyDto } from './dto/create-poll.dto'
import { VotingService } from './voting.service'

@Controller('polls')
export class VotingController {
  constructor(
    private readonly votingService: VotingService,
    private readonly dataSource: DataSource
  ) {}

  @AuthUserPermission({
    featureName: EnumPermissionFeatureName.VOTING,
    action: { canCreate: true },
  })
  @Post()
  async createPoll(@Body() body: CreatePollBodyDto) {
    return this.dataSource.transaction(async etm => {
      return this.votingService.createPoll(body, etm)
    })
  }

  @AuthUserPermission({
    featureName: EnumPermissionFeatureName.VOTING,
    action: { canRead: true },
  })
  @Get('mine')
  async getMyPolls(@ReqUser() user: IAppJwtPayload) {
    return this.votingService.getMyPolls(user['user-id'])
  }

  @AuthUserPermission({
    featureName: EnumPermissionFeatureName.VOTING,
    action: { canUpdate: true },
  })
  @Post(':pollId/close')
  async closePoll(@Param('pollId', ParseUUIDPipe) pollId: string, @ReqUser() user: IAppJwtPayload) {
    return this.votingService.closePoll(pollId, user['user-id'])
  }
}
