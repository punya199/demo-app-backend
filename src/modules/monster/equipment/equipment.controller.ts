import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common'
import { AuthUser, ReqUser } from '../../auth/auth.decorator'
import { IAppJwtPayload } from '../../auth/auth.interface'
import {
  EnhanceBodyDto,
  EquipBodyDto,
  EquipmentIdBodyDto,
  EquipmentIdsBodyDto,
  RefineBodyDto,
  RefineResolveBodyDto,
  UnequipBodyDto,
} from '../dto/equipment.dto'
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
  async getEquipment(
    @ReqUser() user: IAppJwtPayload,
    @Query('monsterId', new ParseUUIDPipe({ optional: true })) monsterId?: string
  ) {
    return this.equipmentService.getEquipment(user['user-id'], undefined, monsterId)
  }

  @AuthUser()
  @Post('equip')
  async equip(@Body() body: EquipBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.equipmentService.equip(
      user['user-id'],
      body.equipmentId,
      body.monsterId,
      body.move ?? false
    )
  }

  @AuthUser()
  @Post('unequip')
  async unequip(@Body() body: UnequipBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.equipmentService.unequip(user['user-id'], body.slot, body.monsterId)
  }

  @AuthUser()
  @Post('dismantle')
  async dismantle(@Body() body: EquipmentIdBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.equipmentService.dismantle(user['user-id'], body.equipmentId)
  }

  @AuthUser()
  @Post('dismantle-many')
  async dismantleMany(@Body() body: EquipmentIdsBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.equipmentService.dismantleMany(user['user-id'], body.equipmentIds)
  }

  @AuthUser()
  @Post('refine')
  async refine(@Body() body: RefineBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.equipmentService.refine(user['user-id'], body.equipmentId, body.line)
  }

  @AuthUser()
  @Post('refine/resolve')
  async resolveRefine(@Body() body: RefineResolveBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.equipmentService.resolveRefine(user['user-id'], body.equipmentId, body.keep)
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
