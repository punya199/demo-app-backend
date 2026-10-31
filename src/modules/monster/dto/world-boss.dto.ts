import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator'
import { EnumEquipmentGrade, EnumEquipmentSlot } from '../equipment-data'

const WEEK_PATTERN = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/

export class ClaimWorldBossBodyDto {
  @IsNotEmpty()
  @Matches(WEEK_PATTERN)
  week: string
}

export class WorldBossRankingQueryDto {
  @IsOptional()
  @Matches(WEEK_PATTERN)
  week?: string
}

export class WorldBossExchangeBodyDto {
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
