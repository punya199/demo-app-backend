import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator'
import { EnumCostumeSlot } from '../equipment/costume-data'

export class BuyCostumeBodyDto {
  @IsString()
  @IsNotEmpty()
  costumeId: string
}

export class EquipCostumeBodyDto extends BuyCostumeBodyDto {
  // Which living pet wears it; defaults to the selected one.
  @IsOptional()
  @IsUUID()
  monsterId?: string
}

export class UnequipCostumeBodyDto {
  @IsEnum(EnumCostumeSlot)
  slot: EnumCostumeSlot

  @IsOptional()
  @IsUUID()
  monsterId?: string
}

export class CostumePrivacyBodyDto {
  @IsBoolean()
  show: boolean
}
