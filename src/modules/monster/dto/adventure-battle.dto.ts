import { IsNotEmpty, IsString } from 'class-validator'

export class AdventureBattleBodyDto {
  @IsNotEmpty()
  @IsString()
  stageId: string
}
