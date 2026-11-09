import { Body, Controller, Get, Post } from '@nestjs/common'
import { AuthUser, ReqUser } from '../../auth/auth.decorator'
import { IAppJwtPayload } from '../../auth/auth.interface'
import { CraftService } from './craft.service'
import { StartCraftBodyDto } from '../dto/craft.dto'

@Controller('monster/craft')
export class CraftController {
  constructor(private readonly craftService: CraftService) {}

  @AuthUser()
  @Get()
  async getOverview(@ReqUser() user: IAppJwtPayload) {
    return this.craftService.getOverview(user['user-id'])
  }

  @AuthUser()
  @Post('start')
  async start(@Body() body: StartCraftBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.craftService.start(user['user-id'], body.recipeId, body.useCatalyst)
  }

  @AuthUser()
  @Post('claim')
  async claim(@ReqUser() user: IAppJwtPayload) {
    return this.craftService.claim(user['user-id'])
  }
}
