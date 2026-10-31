import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator'
import { EnumEquipmentGrade, EnumEquipmentSlot } from '../equipment-data'
import { EnumRaidDifficulty } from '../raid-data'

export class RaidBattleBodyDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(64)
  bossId: string

  @IsNotEmpty()
  @IsEnum(EnumRaidDifficulty)
  difficulty: EnumRaidDifficulty
}

export class RaidExchangeBodyDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(64)
  bossId: string

  @IsNotEmpty()
  @IsEnum(EnumEquipmentSlot)
  slot: EnumEquipmentSlot

  @IsNotEmpty()
  @IsEnum(EnumEquipmentGrade)
  grade: EnumEquipmentGrade
}
