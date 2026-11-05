import { IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator'

export class SetSkillLoadoutBodyDto {
  // Which living pet; defaults to the selected one.
  @IsOptional()
  @IsUUID()
  monsterId?: string

  // Skill ids; null empties the slot.
  @ValidateIf((_, value) => value !== null)
  @IsString()
  s1: string | null

  @ValidateIf((_, value) => value !== null)
  @IsString()
  s2: string | null

  @ValidateIf((_, value) => value !== null)
  @IsString()
  dodge: string | null
}
