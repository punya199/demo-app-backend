import { Body, Controller, Get, Post } from '@nestjs/common'
import { AuthUser, ReqUser } from '../../auth/auth.decorator'
import { IAppJwtPayload } from '../../auth/auth.interface'
import { BuyMaterialBodyDto } from '../dto/equipment.dto'
import { ShopBuyBodyDto, ShopQuantityBodyDto } from '../dto/shop-buy.dto'
import { EquipmentService } from './equipment.service'
import { ShopService } from './shop.service'

@Controller('shop')
export class ShopController {
  constructor(
    private readonly shopService: ShopService,
    private readonly equipmentService: EquipmentService
  ) {}

  @AuthUser()
  @Get('items')
  getItems() {
    return this.shopService.getItems()
  }

  @AuthUser()
  @Post('buy')
  async buy(@Body() body: ShopBuyBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.shopService.buy(user['user-id'], body.itemId, body.quantity)
  }

  @AuthUser()
  @Post('buy-box')
  async buyBox(@Body() body: ShopQuantityBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.equipmentService.buyBox(user['user-id'], body.quantity)
  }

  @AuthUser()
  @Post('buy-material')
  async buyMaterial(@Body() body: BuyMaterialBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.equipmentService.buyMaterial(user['user-id'], body.itemId, body.quantity)
  }
}
