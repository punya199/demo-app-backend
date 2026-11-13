import { IsInt, Max, Min } from 'class-validator'
import { CORE_SLOTS } from '../../../libs/td-sim'

export class TdCoreEquipDto {
  @IsInt()
  @Min(0)
  @Max(CORE_SLOTS - 1)
  slot: number
}
