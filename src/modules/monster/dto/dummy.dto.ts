import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { EnumRaidDifficulty } from '../raid-data'
import { DUMMY_DEF_MAX, DUMMY_ELEMENTS, DUMMY_PRESETS } from '../dummy-data'

export class DummyFightBodyDto {
  @IsIn(DUMMY_PRESETS)
  preset: (typeof DUMMY_PRESETS)[number]

  // Plain dummy only.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(DUMMY_DEF_MAX)
  def?: number

  // Plain dummy only.
  @IsOptional()
  @IsIn(DUMMY_ELEMENTS)
  element?: (typeof DUMMY_ELEMENTS)[number]

  // Boss presets only.
  @IsOptional()
  @IsString()
  @MaxLength(64)
  bossId?: string

  // Raid preset only.
  @IsOptional()
  @IsEnum(EnumRaidDifficulty)
  difficulty?: EnumRaidDifficulty
}
