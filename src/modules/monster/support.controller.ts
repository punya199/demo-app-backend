import { Controller, Get, Post } from '@nestjs/common'
import { AuthUser, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import { SupportService } from './support.service'

@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @AuthUser()
  @Get()
  async getMine(@ReqUser() user: IAppJwtPayload) {
    return this.supportService.getMine(user['user-id'])
  }

  @AuthUser()
  @Post()
  async setSupport(@ReqUser() user: IAppJwtPayload) {
    return this.supportService.setSupport(user['user-id'])
  }

  @AuthUser()
  @Get('rentable')
  async getRentable(@ReqUser() user: IAppJwtPayload) {
    return this.supportService.getRentable(user['user-id'])
  }
}
