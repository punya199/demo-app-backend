import { IsEnum, IsNotEmpty } from 'class-validator'
import { EnumQuestId } from '../quest-data'

export class ClaimQuestBodyDto {
  @IsNotEmpty()
  @IsEnum(EnumQuestId)
  questId: EnumQuestId
}
