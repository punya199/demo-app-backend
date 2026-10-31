import { Body, Controller, Get, Post } from '@nestjs/common'
import { AuthUser, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import { UseItemBodyDto } from './dto/use-item.dto'
import { InventoryService } from './inventory.service'

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @AuthUser()
  @Get()
  async getInventory(@ReqUser() user: IAppJwtPayload) {
    return this.inventoryService.getInventory(user['user-id'])
  }

  @AuthUser()
  @Post('use')
  async use(@Body() body: UseItemBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.inventoryService.use(user['user-id'], body.itemId)
  }
}
