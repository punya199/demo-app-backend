import { IsInt, Max, Min } from 'class-validator'
import { STAGE_COUNT } from '../../../libs/td-sim'

export class TdBattleStartDto {
  @IsInt()
  @Min(1)
  @Max(STAGE_COUNT)
  stageId: number
}
