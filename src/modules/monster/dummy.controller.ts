import { Body, Controller, Get, Post } from '@nestjs/common'
import { AuthUser, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import { DummyFightBodyDto } from './dto/dummy.dto'
import { DummyService } from './dummy.service'

@Controller('dummy')
export class DummyController {
  constructor(private readonly dummyService: DummyService) {}

  @AuthUser()
  @Get('presets')
  getPresets() {
    return this.dummyService.getPresets()
  }

  @AuthUser()
  @Post('fight')
  async fight(@Body() body: DummyFightBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.dummyService.fight(user['user-id'], body)
  }
}
