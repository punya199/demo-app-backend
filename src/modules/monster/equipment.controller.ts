import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import { AuthUser, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import { EnhanceBodyDto, EquipmentIdBodyDto, UnequipBodyDto } from './dto/equipment.dto'
import { EnhanceService } from './enhance.service'
import { EquipmentService } from './equipment.service'

@Controller('equipment')
export class EquipmentController {
  constructor(
    private readonly equipmentService: EquipmentService,
    private readonly enhanceService: EnhanceService
  ) {}

  @AuthUser()
  @Get()
  async getEquipment(@ReqUser() user: IAppJwtPayload) {
    return this.equipmentService.getEquipment(user['user-id'])
  }

  @AuthUser()
  @Post('equip')
  async equip(@Body() body: EquipmentIdBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.equipmentService.equip(user['user-id'], body.equipmentId)
  }

  @AuthUser()
  @Post('unequip')
  async unequip(@Body() body: UnequipBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.equipmentService.unequip(user['user-id'], body.slot)
  }

  @AuthUser()
  @Post('dismantle')
  async dismantle(@Body() body: EquipmentIdBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.equipmentService.dismantle(user['user-id'], body.equipmentId)
  }

  @AuthUser()
  @Get(':id/enhance-preview')
  async getEnhancePreview(
    @Param('id', new ParseUUIDPipe()) id: string,
    @ReqUser() user: IAppJwtPayload
  ) {
    return this.enhanceService.getPreview(user['user-id'], id)
  }

  @AuthUser()
  @Post('enhance')
  async enhance(@Body() body: EnhanceBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.enhanceService.enhance(user['user-id'], body.equipmentId, body.useProtect ?? false)
  }
}
