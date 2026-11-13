import { IsIn } from 'class-validator'
import { TD_HEROES } from '../gacha.config'

export class TdHeroIdParamDto {
  @IsIn(TD_HEROES.map(h => h.id))
  id: string
}
