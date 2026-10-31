import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsUUID } from 'class-validator'
import { EnumEquipmentSlot, EnumMaterialId } from '../equipment-data'

export class EquipmentIdBodyDto {
  @IsNotEmpty()
  @IsUUID()
  equipmentId: string
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
}

export class BuyMaterialBodyDto {
  @IsNotEmpty()
  @IsEnum(EnumMaterialId)
  itemId: EnumMaterialId
}
