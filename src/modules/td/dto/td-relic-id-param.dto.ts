import { IsIn } from 'class-validator'
import { RELIC_IDS } from '../../../libs/td-sim'

export class TdRelicIdParamDto {
  @IsIn(RELIC_IDS)
  id: string
}
