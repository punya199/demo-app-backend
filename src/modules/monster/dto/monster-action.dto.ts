import { IsEnum, IsNotEmpty } from 'class-validator'
import { EnumMonsterAction } from '../monster-engine'

export class MonsterActionBodyDto {
  @IsNotEmpty()
  @IsEnum(EnumMonsterAction)
  type: EnumMonsterAction
}
