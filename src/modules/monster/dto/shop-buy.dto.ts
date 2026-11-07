import { IsEnum, IsNotEmpty } from 'class-validator'
import { EnumShopItemId } from '../equipment/shop-data'

export class ShopBuyBodyDto {
  @IsNotEmpty()
  @IsEnum(EnumShopItemId)
  itemId: EnumShopItemId
}
