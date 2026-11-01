import { IsEnum, IsNotEmpty, IsOptional, IsUUID } from 'class-validator'
import { EnumMonsterAction } from '../monster-engine'

export class MonsterActionBodyDto {
  @IsNotEmpty()
  @IsEnum(EnumMonsterAction)
  type: EnumMonsterAction

  // Which living monster to care for; defaults to the selected one.
  @IsOptional()
  @IsUUID()
  monsterId?: string
}
