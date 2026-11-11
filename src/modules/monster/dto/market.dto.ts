import { Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator'
import { EnumMonsterLine, EnumMonsterStage } from '../../../db/entities/monster.entity'

export enum EnumMarketSort {
  NEWEST = 'newest',
  PRICE_ASC = 'price_asc',
  PRICE_DESC = 'price_desc',
}

export class MarketBrowseQueryDto {
  @IsOptional()
  @IsEnum(EnumMonsterLine)
  line?: EnumMonsterLine

  @IsOptional()
  @IsEnum(EnumMonsterStage)
  stage?: EnumMonsterStage

  @IsOptional()
  @IsEnum(EnumMarketSort)
  sort?: EnumMarketSort
}

export class MarketListBodyDto {
  @IsUUID()
  monsterId: string

  // Checked against the formula's price band by MarketService; the cap only stops absurd input.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  price: number
}
