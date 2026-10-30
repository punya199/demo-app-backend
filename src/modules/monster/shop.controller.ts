import { Body, Controller, Get, Post } from '@nestjs/common'
import { AuthUser, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import { ShopBuyBodyDto } from './dto/shop-buy.dto'
import { ShopService } from './shop.service'

@Controller('shop')
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  @AuthUser()
  @Get('items')
  getItems() {
    return this.shopService.getItems()
  }

  @AuthUser()
  @Post('buy')
  async buy(@Body() body: ShopBuyBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.shopService.buy(user['user-id'], body.itemId)
  }
}
