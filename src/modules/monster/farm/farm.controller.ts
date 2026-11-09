import { Body, Controller, Get, Post } from '@nestjs/common'
import { AuthUser, ReqUser } from '../../auth/auth.decorator'
import { IAppJwtPayload } from '../../auth/auth.interface'
import { FarmKindBodyDto } from '../dto/farm.dto'
import { FarmService } from './farm.service'

@Controller('monster/farm')
export class FarmController {
  constructor(private readonly farmService: FarmService) {}

  @AuthUser()
  @Get()
  async getFarm(@ReqUser() user: IAppJwtPayload) {
    return this.farmService.getFarm(user['user-id'])
  }

  @AuthUser()
  @Post('buy')
  async buy(@Body() body: FarmKindBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.farmService.buy(user['user-id'], body.kind)
  }

  @AuthUser()
  @Post('upgrade')
  async upgrade(@Body() body: FarmKindBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.farmService.startUpgrade(user['user-id'], body.kind)
  }

  @AuthUser()
  @Post('claim')
  async claim(@ReqUser() user: IAppJwtPayload) {
    return this.farmService.claim(user['user-id'])
  }
}
