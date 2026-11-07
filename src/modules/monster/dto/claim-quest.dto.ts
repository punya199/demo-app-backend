import { IsEnum, IsNotEmpty } from 'class-validator'
import { EnumQuestId } from '../adventure/quest-data'

export class ClaimQuestBodyDto {
  @IsNotEmpty()
  @IsEnum(EnumQuestId)
  questId: EnumQuestId
}
