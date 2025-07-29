import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { JwtAuthGuard } from '../user/jwt-auth.guard'
import { CreateHouseRentBodyDto } from './dto/create-house-rent.dto'
import { EditHouseRentBodyDto } from './dto/edit-house-rent.dto'
import { HouseRentService } from './house-rent.service'

@Controller('house-rents')
export class HouseRentController {
  constructor(
    private readonly houseRentService: HouseRentService,
    private readonly dataSource: DataSource
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async createHouseRent(@Body() body: CreateHouseRentBodyDto) {
    return this.dataSource.transaction(async etm => {
      return this.houseRentService.createHouseRent(body, etm)
    })
  }

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
