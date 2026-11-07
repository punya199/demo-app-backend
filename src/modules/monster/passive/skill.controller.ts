import { Body, Controller, Get, Post } from '@nestjs/common'
import { AuthUser, ReqUser } from '../../auth/auth.decorator'
import { IAppJwtPayload } from '../../auth/auth.interface'
import { SetSkillLoadoutBodyDto } from '../dto/skill.dto'
import { SkillService } from './skill.service'

@Controller('skills')
export class SkillController {
  constructor(private readonly skillService: SkillService) {}

  @AuthUser()
  @Get()
  async getState(@ReqUser() user: IAppJwtPayload) {
    return this.skillService.getState(user['user-id'])
  }

  @AuthUser()
  @Post('loadout')
  async setLoadout(@Body() body: SetSkillLoadoutBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.skillService.setLoadout(
      user['user-id'],
      { s1: body.s1 ?? null, s2: body.s2 ?? null, dodge: body.dodge ?? null },
      body.monsterId
    )
  }
}
