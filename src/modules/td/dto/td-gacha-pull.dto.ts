import { IsIn } from 'class-validator'
import { GachaMode } from '../gacha'

export class TdGachaPullDto {
  @IsIn(['single', 'ten', 'free'])
  mode: GachaMode
}
