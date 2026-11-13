import { Type } from 'class-transformer'
import { IsInt, Max, Min } from 'class-validator'
import { STAGE_COUNT } from '../../../libs/td-sim'

export class TdStageIdParamDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(STAGE_COUNT)
  id: number
}
