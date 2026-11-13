import { Controller, Get, UseGuards } from '@nestjs/common'
import { AuthUser, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import { TdProfileService } from './td-profile.service'
import { TdRateLimitGuard } from './td-rate-limit.guard'

@Controller('td')
export class TdProfileController {
  constructor(private readonly profileService: TdProfileService) {}

  // Guards run in decorator order bottom-up: JWT first, then the per-user limit.
  @UseGuards(new TdRateLimitGuard())
  @AuthUser()
  @Get('profile')
  getProfile(@ReqUser() user: IAppJwtPayload) {
    return this.profileService.getProfile(user['user-id'])
  }
}
