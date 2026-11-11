import { IsEnum, IsInt, IsNotEmpty, IsOptional, Max, Min } from 'class-validator'
import { SHOP_BUY_MAX_QUANTITY } from '../core/monster-rules'
import { EnumShopItemId } from '../equipment/shop-data'

export class ShopQuantityBodyDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(SHOP_BUY_MAX_QUANTITY)
  quantity?: number
}

export class ShopBuyBodyDto extends ShopQuantityBodyDto {
  @IsNotEmpty()
  @IsEnum(EnumShopItemId)
  itemId: EnumShopItemId
}
