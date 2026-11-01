import { Body, Controller, Get, Post } from '@nestjs/common'
import { AuthUser, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import { CostumeService } from './costume.service'
import {
  BuyCostumeBodyDto,
  CostumePrivacyBodyDto,
  EquipCostumeBodyDto,
  UnequipCostumeBodyDto,
} from './dto/costume.dto'

@Controller('costume')
export class CostumeController {
  constructor(private readonly costumeService: CostumeService) {}

  @AuthUser()
  @Get()
  async getState(@ReqUser() user: IAppJwtPayload) {
    return this.costumeService.getState(user['user-id'])
  }

  @AuthUser()
  @Post('buy')
  async buy(@Body() body: BuyCostumeBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.costumeService.buy(user['user-id'], body.costumeId)
  }

  @AuthUser()
  @Post('equip')
  async equip(@Body() body: EquipCostumeBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.costumeService.equip(user['user-id'], body.costumeId, body.monsterId)
  }

  @AuthUser()
  @Post('unequip')
  async unequip(@Body() body: UnequipCostumeBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.costumeService.unequip(user['user-id'], body.slot, body.monsterId)
  }

  @AuthUser()
  @Post('privacy')
  async setPrivacy(@Body() body: CostumePrivacyBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.costumeService.setShowCostume(user['user-id'], body.show)
  }
}
