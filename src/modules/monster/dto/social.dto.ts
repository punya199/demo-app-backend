import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator'
import { PVP_DISPLAY_NAME_MAX, PVP_DISPLAY_NAME_MIN } from '../monster-rules'
import { EnumShopItemId } from '../shop-data'

export class SetProfileNameBodyDto {
  // Same rules as the arena name it replaces: plain text, no markup characters.
  @IsString()
  @Length(PVP_DISPLAY_NAME_MIN, PVP_DISPLAY_NAME_MAX)
  @Matches(/^[^<>&"'`\p{Cc}]+$/u)
  displayName: string
}

export class FriendRequestBodyDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(32)
  friendCode: string
}

export class FriendRespondBodyDto {
  @IsNotEmpty()
  @IsUUID()
  relationId: string

  @IsBoolean()
  accept: boolean
}

export class FriendGiftBodyDto {
  @IsNotEmpty()
  @IsEnum(EnumShopItemId)
  itemId: EnumShopItemId
}

export class WorldBossAttackBodyDto {
  // A friend's support unit to fight alongside; omit to fight alone.
  @IsOptional()
  @IsUUID()
  supportId?: string
}
