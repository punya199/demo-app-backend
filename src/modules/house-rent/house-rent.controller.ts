import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { EnumPermissionFeatureName } from '../../db/entities/permissions'
import { AuthUserPermission } from '../auth/auth.decorator'
import { CreateHouseRentBodyDto } from './dto/create-house-rent.dto'
import { EditHouseRentBodyDto } from './dto/edit-house-rent.dto'
import { HouseRentService } from './house-rent.service'

@Controller('house-rents')
export class HouseRentController {
  constructor(
    private readonly houseRentService: HouseRentService,
    private readonly dataSource: DataSource
  ) {}

  @AuthUserPermission({
    featureName: EnumPermissionFeatureName.HOUSE_RENT,
    action: { canCreate: true },
  })
  @Post()
  async createHouseRent(@Body() body: CreateHouseRentBodyDto) {
    return this.dataSource.transaction(async etm => {
      return this.houseRentService.createHouseRent(body, etm)
    })
  }

  @AuthUserPermission({
    featureName: EnumPermissionFeatureName.HOUSE_RENT,
    action: { canUpdate: true },
  })
  @Put(':houseRentId')
  async updateHouseRent(
    @Param('houseRentId', ParseUUIDPipe) houseRentId: string,
    @Body() body: EditHouseRentBodyDto
  ) {
    return this.dataSource.transaction(async etm => {
      return this.houseRentService.updateHouseRent(houseRentId, body, etm)
    })
  }

  @Get('overview')
  async getHouseRentOverview() {
    return this.houseRentService.getHouseRentOverview()
  }

  @Get('users/:userId')
  async getHouseRentUser(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.houseRentService.getHouseRentUser(userId)
  }

  @Get('users')
  async getHouseRentUsers() {
    return this.houseRentService.getHouseRentUsers()
  }

  @Get(':houseRentId')
  async getHouseRent(@Param('houseRentId', ParseUUIDPipe) houseRentId: string) {
    return this.houseRentService.getHouseRent(houseRentId)
  }

  @Get()
  async getHouseRents() {
    return this.houseRentService.getHouseRents()
  }

  @AuthUserPermission({
    featureName: EnumPermissionFeatureName.HOUSE_RENT,
    action: { canDelete: true },
  })
  @Delete(':houseRentId')
  async deleteHouseRent(@Param('houseRentId', ParseUUIDPipe) houseRentId: string) {
    return this.houseRentService.deleteHouseRent(houseRentId)
  }
}
