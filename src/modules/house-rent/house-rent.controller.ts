import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { AuthUser } from '../user/user.decorator'
import { CreateHouseRentBodyDto } from './dto/create-house-rent.dto'
import { EditHouseRentBodyDto } from './dto/edit-house-rent.dto'
import { HouseRentService } from './house-rent.service'

@Controller('house-rents')
export class HouseRentController {
  constructor(
    private readonly houseRentService: HouseRentService,
    private readonly dataSource: DataSource
  ) {}

  @AuthUser()
  @Post()
  async createHouseRent(@Body() body: CreateHouseRentBodyDto) {
    return this.dataSource.transaction(async etm => {
      return this.houseRentService.createHouseRent(body, etm)
    })
  }

  @AuthUser()
  @Put(':houseRentId')
  async updateHouseRent(
    @Param('houseRentId', ParseUUIDPipe) houseRentId: string,
    @Body() body: EditHouseRentBodyDto
  ) {
    return this.dataSource.transaction(async etm => {
      return this.houseRentService.updateHouseRent(houseRentId, body, etm)
    })
  }

  @Get(':houseRentId')
  async getHouseRent(@Param('houseRentId', ParseUUIDPipe) houseRentId: string) {
    return this.houseRentService.getHouseRent(houseRentId)
  }

  @Get()
  async getHouseRents() {
    return this.houseRentService.getHouseRents()
  }
}
