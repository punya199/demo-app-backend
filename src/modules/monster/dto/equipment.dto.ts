import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsUUID,
} from 'class-validator'
import { EnumEquipmentSlot, EnumMaterialId } from '../equipment-data'
import { EQUIPMENT_CAPACITY } from '../monster-rules'

export class EquipmentIdBodyDto {
  @IsNotEmpty()
  @IsUUID()
  equipmentId: string
}

export class EquipmentIdsBodyDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(EQUIPMENT_CAPACITY)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  equipmentIds: string[]
}

export class EquipBodyDto extends EquipmentIdBodyDto {
  // Which living pet wears it; defaults to the selected one.
  @IsOptional()
  @IsUUID()
  monsterId?: string

  // Take the piece off the pet wearing it and put it on this one. Without it, a piece another
  // pet wears is refused.
  @IsOptional()
  @IsBoolean()
  move?: boolean
}

export class EnhanceBodyDto extends EquipmentIdBodyDto {
  @IsOptional()
  @IsBoolean()
  useProtect?: boolean
}

export class UnequipBodyDto {
  @IsNotEmpty()
  @IsEnum(EnumEquipmentSlot)
  slot: EnumEquipmentSlot

  @IsOptional()
  @IsUUID()
  monsterId?: string
}

export class BuyMaterialBodyDto {
  @IsNotEmpty()
  @IsEnum(EnumMaterialId)
  itemId: EnumMaterialId
}
