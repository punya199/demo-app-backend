import { IsEnum, IsNotEmpty } from 'class-validator'
import { EnumMonsterLine } from '../../../db/entities/monster.entity'

export class HatchMonsterBodyDto {
  @IsNotEmpty()
  @IsEnum(EnumMonsterLine)
  line: EnumMonsterLine
}
