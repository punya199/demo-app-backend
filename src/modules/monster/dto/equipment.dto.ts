import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsUUID,
} from 'class-validator'
import { EnumEquipmentSlot, EnumMaterialId, StatKey, STAT_KEYS } from '../equipment/equipment-data'
import { EQUIPMENT_CAPACITY } from '../core/monster-rules'

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

export class RefineBodyDto extends EquipmentIdBodyDto {
  // The secondary stat line to re-roll.
  @IsIn(STAT_KEYS)
  line: StatKey
}

export class RefineResolveBodyDto extends EquipmentIdBodyDto {
  // Keep the new value (true) or the old one (false); the stone is spent either way.
  @IsBoolean()
  keep: boolean
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
