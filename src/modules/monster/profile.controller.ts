import { Body, Controller, Get, Post } from '@nestjs/common'
import { AuthUser, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import { SetProfileNameBodyDto } from './dto/social.dto'
import { ProfileService } from './profile.service'

const toView = (profile: { displayName: string; friendCode: string }) => ({
  displayName: profile.displayName,
  friendCode: profile.friendCode,
})

@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @AuthUser()
  @Get()
  async getProfile(@ReqUser() user: IAppJwtPayload) {
    return toView(await this.profileService.ensureProfile(user['user-id']))
  }

  @AuthUser()
  @Post('name')
  async setName(@Body() body: SetProfileNameBodyDto, @ReqUser() user: IAppJwtPayload) {
    return toView(await this.profileService.setDisplayName(user['user-id'], body.displayName))
  }
}
