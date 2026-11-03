import { Body, Controller, Get, Post } from '@nestjs/common'
import { AuthUser, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import { PassiveNodeBodyDto } from './dto/passive.dto'
import { PassiveService } from './passive.service'

@Controller('passive')
export class PassiveController {
  constructor(private readonly passiveService: PassiveService) {}

  @AuthUser()
  @Get()
  async getState(@ReqUser() user: IAppJwtPayload) {
    return this.passiveService.getState(user['user-id'])
  }

  @AuthUser()
  @Post('allocate')
  async allocate(@Body() body: PassiveNodeBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.passiveService.allocate(user['user-id'], body.nodeId)
  }

  @AuthUser()
  @Post('deallocate')
  async deallocate(@Body() body: PassiveNodeBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.passiveService.deallocate(user['user-id'], body.nodeId)
  }

  @AuthUser()
  @Post('deallocate-branch')
  async deallocateBranch(@Body() body: PassiveNodeBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.passiveService.deallocateBranch(user['user-id'], body.nodeId)
  }

  @AuthUser()
  @Post('respec')
  async respec(@ReqUser() user: IAppJwtPayload) {
    return this.passiveService.respec(user['user-id'])
  }
}
